"""Google Gemini vision (CV_MODE=gemini).

Berbagi seluruh logika dengan app/inference/vlm.py — skema jawaban, pemetaan
keyakinan, prompt, penguraian, dan jalur cadangan ke model lokal. Yang khas Gemini
hanya bentuk panggilan API dan cara ia menolak permintaan.

TIGA PERBEDAAN DARI CLAUDE yang jadi bug kalau kodenya disalin mentah:

1. Timeout bersatuan MILIDETIK di HttpOptions, bukan detik. Menyalin `timeout=12`
   apa adanya menghasilkan batas 12 milidetik — setiap panggilan gagal, dan kiosk
   diam-diam berjalan sepenuhnya di model cadangan.

2. Pemblokiran punya DUA jalur terpisah, dan keduanya mengembalikan HTTP 200:
   - `prompt_feedback.block_reason` — permintaannya yang ditolak, tanpa kandidat.
   - `candidate.finish_reason` — jawabannya dihentikan (SAFETY, PROHIBITED_CONTENT,
     IMAGE_SAFETY, MAX_TOKENS).
   Memeriksa satu saja menyisakan lubang; `.text` pada respons terblokir bisa kosong
   atau melempar, dan tanpa penanganan eksplisit kegagalannya jadi senyap.

3. Filter keamanan lebih mudah tersentuh di sini, dan frame kiosk BERISI ANAK-ANAK.
   Ambangnya sengaja dilonggarkan ke BLOCK_ONLY_HIGH: risiko nyata pada produk ini
   bukan model menghasilkan hal berbahaya, melainkan filter salah menandai foto anak
   yang sedang memegang botol lalu mematikan kiosk di tengah demo. Ini keputusan
   sadar, bukan kelalaian — dan pemblokiran yang tetap terjadi berakhir di model
   lokal, bukan di layar error.
"""

import logging

from app.inference.base import Classifier
from app.inference.vlm import (
    SCHEMA,
    SYSTEM_PROMPT,
    USER_PROMPT,
    ProviderBlocked,
    QuotaExhausted,
    VlmClassifier,
    is_quota_error,
    retry_after_seconds,
)

log = logging.getLogger("cv.gemini")

# Skema yang sama, minus `additionalProperties`.
#
# Anthropic MEWAJIBKAN kunci itu untuk structured output; Gemini justru MENOLAK
# permintaannya — 400 INVALID_ARGUMENT, "Unknown name additional_properties".
# Menyalin skema apa adanya membuat setiap panggilan gagal dan kiosk berjalan
# sepenuhnya di model cadangan tanpa satu pun error yang terlihat di layar.
#
# Diturunkan dari SCHEMA, bukan ditulis ulang, supaya daftar fieldnya tetap satu
# sumber: menambah field di vlm.py otomatis ikut terbawa ke sini.
GEMINI_SCHEMA = {k: v for k, v in SCHEMA.items() if k != "additionalProperties"}

# finish_reason yang berarti jawaban tidak utuh/tidak boleh dipakai. STOP adalah
# satu-satunya yang normal; sisanya harus jatuh ke cadangan, bukan diurai paksa.
#
# Dipisah dua karena keduanya menunjuk masalah yang berbeda. Yang DIBLOKIR berarti
# filter keamanan tersentuh — bila itu sering terjadi, penyebabnya frame kiosk
# (yang berisi anak-anak) dan obatnya ada di sisi prompt/safety settings. Yang
# TERPOTONG berarti jawabannya kehabisan token, dan obatnya menaikkan
# max_output_tokens. Digabung jadi satu penghitung, keduanya tak bisa dibedakan.
BLOCKED_FINISH = {
    "SAFETY",
    "PROHIBITED_CONTENT",
    "IMAGE_SAFETY",
    "BLOCKLIST",
    "RECITATION",
    "SPII",
}
TRUNCATED_FINISH = {"MAX_TOKENS", "OTHER"}
BAD_FINISH = BLOCKED_FINISH | TRUNCATED_FINISH


class GeminiVlm(VlmClassifier):
    """Gemini vision dengan cadangan lokal, sekontrak AnthropicVlm."""

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float,
        fallback: Classifier | None = None,
        thinking_level: str = "",
        max_rpm: int = 0,
        cache_ttl_s: float = 0.0,
        max_tpm: int = 0,
        max_image_px: int = 0,
    ):
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise RuntimeError(
                "CV_MODE=gemini membutuhkan package google-genai (pip install google-genai)"
            ) from e

        super().__init__(
            version=model, fallback=fallback, max_rpm=max_rpm, cache_ttl_s=cache_ttl_s,
            max_tpm=max_tpm, max_image_px=max_image_px,
        )
        self._types = types
        self._model = model
        # timeout SDK dalam milidetik — lihat catatan 1 di docstring modul.
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=int(timeout * 1000)),
        )
        # Dibiarkan None bila tidak diminta: dukungan thinking berbeda antar model
        # (gemini-3.5-flash menerima thinking_level tapi MENOLAK thinking_budget=0
        # dengan 400), dan konfigurasi yang ditolak berakhir sebagai kegagalan
        # senyap — kiosk tetap menjawab, tapi sepenuhnya dari model cadangan.
        thinking = types.ThinkingConfig(thinking_level=thinking_level) if thinking_level else None

        self._config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=GEMINI_SCHEMA,
            # Jawabannya sendiri hanya ~40 token, tapi di Gemini token THINKING
            # ikut memakan jatah ini. Dengan 256, sebagian panggilan berhenti di
            # MAX_TOKENS sebelum sempat menulis JSON-nya — terlihat sebagai
            # "jawaban dihentikan" lalu jatuh ke cadangan. Terpantau langsung saat
            # uji hidup; 1024 memberi ruang thinking tanpa biaya berarti karena
            # yang ditagih adalah token yang benar-benar dipakai.
            max_output_tokens=1024,
            thinking_config=thinking,
            safety_settings=[
                types.SafetySetting(category=c, threshold="BLOCK_ONLY_HIGH")
                for c in (
                    "HARM_CATEGORY_HARASSMENT",
                    "HARM_CATEGORY_HATE_SPEECH",
                    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "HARM_CATEGORY_DANGEROUS_CONTENT",
                )
            ],
        )
        log.info(
            "Gemini siap: model=%s, timeout=%.1fs, cadangan=%s",
            model, timeout, type(fallback).__name__ if fallback else "TIDAK ADA",
        )

    def _ask(self, image_jpeg: bytes) -> str:
        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=[
                    self._types.Part.from_bytes(data=image_jpeg, mime_type="image/jpeg"),
                    USER_PROMPT,
                ],
                config=self._config,
            )
        except Exception as e:
            # 429 diangkat jadi tipe tersendiri supaya pemanggil bisa MEMBUKA
            # PEMUTUS, bukan sekadar mencoba lagi 2 detik kemudian. Tanpa ini,
            # kuota yang habis terlihat identik dengan kabel LAN tercabut —
            # padahal yang satu pulih sendiri dan yang lain tidak.
            if is_quota_error(e):
                raise QuotaExhausted(str(e), retry_after_seconds(e)) from e
            raise

        meta = getattr(response, "usage_metadata", None)
        if meta is not None:
            self._note_usage(getattr(meta, "total_token_count", 0))

        # Jalur pemblokiran 1: permintaannya yang ditolak — tidak ada kandidat sama sekali.
        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None and getattr(feedback, "block_reason", None):
            raise ProviderBlocked(f"prompt diblokir: {feedback.block_reason}")

        candidates = getattr(response, "candidates", None)
        if not candidates:
            raise ProviderBlocked("balasan tanpa kandidat")

        # Jalur pemblokiran 2: jawabannya yang dihentikan di tengah jalan.
        finish = getattr(candidates[0], "finish_reason", None)
        if finish is not None:
            name = getattr(finish, "name", None) or str(finish)
            short = name.rsplit(".", 1)[-1]
            if short in BLOCKED_FINISH:
                raise ProviderBlocked(f"jawaban dihentikan: {name}")
            if short in TRUNCATED_FINISH:
                raise RuntimeError(f"jawaban terpotong: {name}")

        text = response.text
        if not text:
            raise RuntimeError("balasan tanpa teks")
        return text
