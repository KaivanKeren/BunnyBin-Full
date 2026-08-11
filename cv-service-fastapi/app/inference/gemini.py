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
from app.inference.vlm import SCHEMA, SYSTEM_PROMPT, USER_PROMPT, VlmClassifier

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
BAD_FINISH = {
    "SAFETY",
    "PROHIBITED_CONTENT",
    "IMAGE_SAFETY",
    "BLOCKLIST",
    "RECITATION",
    "SPII",
    "MAX_TOKENS",
    "OTHER",
}


class GeminiVlm(VlmClassifier):
    """Gemini vision dengan cadangan lokal, sekontrak AnthropicVlm."""

    def __init__(self, api_key: str, model: str, timeout: float, fallback: Classifier | None = None):
        try:
            from google import genai
            from google.genai import types
        except ImportError as e:
            raise RuntimeError(
                "CV_MODE=gemini membutuhkan package google-genai (pip install google-genai)"
            ) from e

        super().__init__(version=model, fallback=fallback)
        self._types = types
        self._model = model
        # timeout SDK dalam milidetik — lihat catatan 1 di docstring modul.
        self._client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=int(timeout * 1000)),
        )
        self._config = types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=GEMINI_SCHEMA,
            max_output_tokens=256,
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
        response = self._client.models.generate_content(
            model=self._model,
            contents=[
                self._types.Part.from_bytes(data=image_jpeg, mime_type="image/jpeg"),
                USER_PROMPT,
            ],
            config=self._config,
        )

        # Jalur pemblokiran 1: permintaannya yang ditolak — tidak ada kandidat sama sekali.
        feedback = getattr(response, "prompt_feedback", None)
        if feedback is not None and getattr(feedback, "block_reason", None):
            raise RuntimeError(f"prompt diblokir: {feedback.block_reason}")

        candidates = getattr(response, "candidates", None)
        if not candidates:
            raise RuntimeError("balasan tanpa kandidat")

        # Jalur pemblokiran 2: jawabannya yang dihentikan di tengah jalan.
        finish = getattr(candidates[0], "finish_reason", None)
        if finish is not None:
            name = getattr(finish, "name", None) or str(finish)
            if name.rsplit(".", 1)[-1] in BAD_FINISH:
                raise RuntimeError(f"jawaban dihentikan: {name}")

        text = response.text
        if not text:
            raise RuntimeError("balasan tanpa teks")
        return text
