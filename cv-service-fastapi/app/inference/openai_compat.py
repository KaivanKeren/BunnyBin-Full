"""Penyedia OpenAI-compatible (CV_MODE=openai) — satu class, banyak penyedia.

KENAPA PROTOKOL, BUKAN VENDOR
-----------------------------
Groq, Ollama, OpenRouter, LM Studio, llama.cpp server, dan vLLM semuanya bicara
dialek API yang sama: POST {base_url}/chat/completions. Menulis satu subclass per
vendor berarti N salinan kode yang sama dengan N set bug yang berbeda; menulis
SATU subclass untuk protokolnya berarti mengganti penyedia cukup dengan mengganti
dua environment variable — tanpa menyentuh kode, tanpa deploy ulang image.

Tiga konfigurasi yang dituju (lihat .env.example):

  Groq (cloud, GRATIS, model open-weight):
    OPENAI_BASE_URL=https://api.groq.com/openai/v1
    OPENAI_MODEL=qwen/qwen3.6-27b        <- Qwen VLM 27B, jauh di atas free tier
    OPENAI_API_KEY=gsk_...                  Gemini: 30 RPM & 14.400 req/hari

  Ollama (lokal, open-source penuh, TANPA kuota — butuh GPU yang layak):
    OPENAI_BASE_URL=http://localhost:11434/v1
    OPENAI_MODEL=qwen3-vl                <- tanpa API key
    (di mesin tanpa GPU NVIDIA, VLM lokal makan 5-20 dtk/frame — tidak muat di
     jendela pindai kiosk 15 dtk; jalurnya tetap tersedia untuk hardware nanti)

  OpenRouter (cloud, :free = 50 req/hari — hanya untuk uji coba):
    OPENAI_BASE_URL=https://openrouter.ai/api/v1

Dipakai httpx yang memang sudah jadi dependensi — BUKAN package openai. Menambah
SDK demi satu endpoint POST berarti satu pohon dependensi lagi yang ikut masuk
image produksi, untuk abstraksi yang di sini justru harus ditembus (kita perlu
mengendalikan penanganan 429 dan header persis).

YANG BERBEDA DARI PENYEDIA LAIN
-------------------------------
1. Autentikasi OPSIONAL. Ollama/llama.cpp lokal tidak butuh kunci; header
   Authorization hanya dikirim bila kuncinya ada. Mode openai karenanya TIDAK
   menolak start tanpa OPENAI_API_KEY — berbeda dari gemini/vlm yang tanpa kunci
   sudah pasti gagal.

2. Penegakan skema tidak seragam. response_format json_schema dipahami Groq,
   OpenRouter, dan Ollama terbaru, tapi tidak semua server. Dua lapis pertahanan:
   instruksi JSON eksplisit SELALU ditempel ke system prompt (tidak merugikan
   siapa pun), dan response_format bisa dimatikan lewat OPENAI_JSON_MODE=off
   untuk server yang menolaknya dengan 400.

3. 429 membawa header Retry-After standar HTTP, bukan google.rpc.RetryInfo.
"""

import base64
import json
import logging

from app.inference.vlm import (
    SCHEMA,
    SYSTEM_PROMPT,
    USER_PROMPT,
    ProviderBlocked,
    QuotaExhausted,
    VlmClassifier,
)

log = logging.getLogger("cv.openai")

# Ditempel ke SYSTEM_PROMPT. Penyedia yang menegakkan response_format tidak
# terganggu olehnya; penyedia yang mengabaikan response_format justru bergantung
# padanya — tanpa ini, model menjawab prosa, penguraian gagal, dan SEMUA frame
# jatuh ke model cadangan tanpa error yang terlihat.
JSON_INSTRUCTION = (
    "\n\nJawab HANYA dengan JSON satu baris persis berbentuk "
    '{"kategori": "organic"|"inorganic"|"none", "nama_objek": "<nama Indonesia>", '
    '"yakin": "tinggi"|"sedang"|"rendah"} — tanpa teks lain, tanpa markdown.'
)


class OpenAiCompatVlm(VlmClassifier):
    """VLM lewat endpoint /chat/completions apa pun, sekontrak penyedia lain."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout: float,
        fallback=None,
        max_rpm: int = 0,
        cache_ttl_s: float = 0.0,
        json_mode: str = "schema",
        max_tpm: int = 0,
        max_image_px: int = 0,
        reasoning_effort: str = "",
    ):
        import httpx  # dependensi inti requirements.txt — selalu ada

        super().__init__(
            version=model, fallback=fallback, max_rpm=max_rpm, cache_ttl_s=cache_ttl_s,
            max_tpm=max_tpm, max_image_px=max_image_px,
        )
        self._model = model
        self._json_mode = json_mode
        self._reasoning_effort = reasoning_effort

        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        self._client = httpx.Client(
            base_url=base_url.rstrip("/"),
            headers=headers,
            timeout=timeout,
        )
        log.info(
            "OpenAI-compat siap: base=%s, model=%s, auth=%s, json=%s, thinking=%s, cadangan=%s",
            base_url, model, "ya" if api_key else "tanpa-kunci", json_mode,
            reasoning_effort or "bawaan model",
            type(fallback).__name__ if fallback else "TIDAK ADA",
        )

    def _ask(self, image_jpeg: bytes) -> str:
        body = {
            "model": self._model,
            "max_tokens": 1024,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT + JSON_INSTRUCTION},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "data:image/jpeg;base64,"
                                + base64.b64encode(image_jpeg).decode()
                            },
                        },
                        {"type": "text", "text": USER_PROMPT},
                    ],
                },
            ],
        }
        # Model penalar (Qwen, gpt-oss) menulis blok <think> panjang sebelum
        # menjawab. TERUKUR terhadap Groq: 677 token thinking untuk JSON yang
        # isinya ~40 token, dan 1,44 dtk latensi. Dimatikan: 46 token, 0,22 dtk.
        #
        # Untuk klasifikasi dua kelas, penalaran itu tidak membeli apa pun —
        # sementara token per menit adalah batas yang sungguh habis lebih dulu,
        # dan latensi langsung memakan jendela pindai anak.
        if self._reasoning_effort:
            body["reasoning_effort"] = self._reasoning_effort

        if self._json_mode == "schema":
            # SCHEMA dipakai apa adanya: `additionalProperties: false` yang
            # ditolak Gemini justru DIWAJIBKAN oleh json_schema strict di sini.
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "klasifikasi_sampah",
                    "schema": SCHEMA,
                    "strict": True,
                },
            }

        response = self._client.post("/chat/completions", json=body)

        if response.status_code == 429:
            # Retry-After standar HTTP: detik dalam bilangan bulat. Bentuk
            # tanggal HTTP juga sah menurut spek tapi tidak dipakai penyedia
            # LLM mana pun — bila tak teruraikan, biarkan None dan pemutus di
            # kelas induk memakai backoff-nya sendiri.
            retry_after = None
            raw = response.headers.get("retry-after", "")
            try:
                retry_after = float(raw)
            except ValueError:
                pass
            raise QuotaExhausted(
                f"429 dari {self._client.base_url}: {response.text[:200]}",
                retry_after_s=retry_after,
            )

        if response.status_code != 200:
            # Potong badan respons: halaman error HTML dari reverse proxy bisa
            # ratusan KB, dan seluruhnya akan berakhir di baris log.
            raise RuntimeError(f"HTTP {response.status_code}: {response.text[:200]}")

        data = response.json()

        # Biaya SEBENARNYA panggilan ini. Inilah yang membuat rem token berhenti
        # menebak: untuk beban gambar, token per menit adalah batas yang
        # sungguh-sungguh habis lebih dulu, dan besarnya berbeda tiap frame.
        usage = data.get("usage") or {}
        self._note_usage(usage.get("total_tokens"))

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("balasan tanpa choices")

        choice = choices[0]
        message = choice.get("message") or {}

        # Dua bentuk penolakan yang sama-sama datang sebagai HTTP 200:
        # field `refusal` eksplisit, atau finish_reason content_filter dengan
        # content kosong. Keduanya harus jadi ProviderBlocked, bukan diurai paksa.
        if message.get("refusal"):
            raise ProviderBlocked(f"refusal: {message['refusal']}")
        finish = choice.get("finish_reason")
        if finish == "content_filter":
            raise ProviderBlocked("finish_reason=content_filter")
        if finish == "length":
            raise RuntimeError("jawaban terpotong: finish_reason=length")

        content = message.get("content")
        # Sebagian server mengembalikan content sebagai daftar bagian, bukan
        # string — bentuk sah di spek yang jarang dipakai tapi murah ditangani.
        if isinstance(content, list):
            content = "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        if not content:
            raise RuntimeError("balasan tanpa teks")

        # Model thinking (mis. Qwen) kadang membungkus jawaban dengan blok
        # <think>…</think> walau diminta JSON murni. Buang sebelum diurai.
        if "</think>" in content:
            content = content.rsplit("</think>", 1)[-1]

        return content.strip()
