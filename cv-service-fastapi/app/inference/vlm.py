"""Klasifikasi lewat VLM cloud, dengan model lokal sebagai cadangan.

Dipakai saat CV_MODE=vlm (Claude) atau CV_MODE=gemini. Berbeda dari YoloClassifier
yang mengenali 9 kelas hasil latihan, model bahasa-visual membaca gambar dan menalar
dengan bahasa — jadi ia bisa menyebut objek di luar 9 kelas itu, menjawab dalam Bahasa
Indonesia, dan yang paling penting untuk kiosk: mengatakan bahwa TIDAK ADA sampah di
frame.

Kemampuan terakhir itu menutup lubang nyata. Dataset yang melatih best.pt tidak memuat
satu pun gambar latar (`645 images, 0 backgrounds`), sehingga model lokal tidak pernah
belajar wujud "tidak ada apa-apa" dan memaksakan salah satu kelasnya pada tangan anak
atau tepi tong sampah.

PEMBAGIAN TANGGUNG JAWAB
------------------------
`VlmClassifier` memegang semua yang tidak bergantung penyedia: skema jawaban, pemetaan
keyakinan, prompt, penguraian JSON, dan jalur cadangan. Subclass hanya mengisi `_ask()`
— satu panggilan API yang mengembalikan teks JSON atau melempar exception.

Pembagian ini bukan hiasan: ia membuat pergantian penyedia menyentuh ~30 baris, dan
membuat test perilaku (kapan jatuh ke cadangan, kapan "none" bukan kegagalan) berlaku
untuk semua penyedia tanpa ditulis ulang.

CADANGAN OTOMATIS
-----------------
Setiap kegagalan `_ask()` — timeout, koneksi putus, status non-2xx, pemblokiran
keamanan, JSON tak sesuai skema — jatuh ke classifier lokal, bukan melempar exception
ke atas. Kiosk dan Laravel tidak perlu tahu apa pun soal ini; keduanya tetap menerima
`Detection` yang sama bentuknya.

`model_version` selalu menandai jalur mana yang benar-benar melayani, sehingga
kegagalan senyap terlihat di log dan di respons — bukan tersamar sebagai keberhasilan.
"""

import base64
import json
import logging
from abc import abstractmethod
from io import BytesIO

from PIL import Image

from app.inference.base import Classifier, Detection

log = logging.getLogger("cv.vlm")

# Keyakinan kategorikal, bukan angka. VLM tidak menghasilkan probabilitas
# terkalibrasi: diminta menyebut angka, ia cenderung menjawab 0.9 untuk apa pun,
# dan CV_CONFIDENCE_THRESHOLD berubah jadi konfigurasi mati yang tak pernah
# menyaring apa-apa. Tiga tingkat yang dipetakan di sini menjaga ambang itu tetap
# bermakna — "rendah" jatuh di bawah 0.6, sehingga endpoint me-null-kan kategorinya
# dan kiosk memperlakukannya sebagai "belum terdeteksi": mencoba lagi, lalu jatuh ke
# mode manual bila waktu pindai habis.
CERTAINTY = {"tinggi": 0.95, "sedang": 0.70, "rendah": 0.40}

SCHEMA = {
    "type": "object",
    "properties": {
        "kategori": {"type": "string", "enum": ["organic", "inorganic", "none"]},
        "nama_objek": {"type": "string"},
        "yakin": {"type": "string", "enum": ["tinggi", "sedang", "rendah"]},
    },
    "required": ["kategori", "nama_objek", "yakin"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """Kamu adalah pengenal sampah pada kiosk edukasi di sekolah dasar di Indonesia.

Seorang anak menunjukkan satu benda ke kamera. Tentukan benda itu sampah organik atau
anorganik, lalu sebutkan namanya dalam Bahasa Indonesia sehari-hari yang dimengerti anak
SD — misalnya "Kulit Pisang", "Botol Plastik", "Bungkus Snack", "Masker".

Aturan:
- organic  = bisa membusuk secara alami: sisa makanan, kulit buah, daun, ampas.
- inorganic = tidak bisa membusuk: plastik, kaleng, kaca, styrofoam, masker, kertas.
- none = tidak ada sampah yang jelas di frame. Pakai ini bila yang terlihat hanya
  tangan kosong, wajah, meja, lantai, atau latar ruangan. Jangan menebak-nebak.

Tingkat keyakinan:
- tinggi = benda terlihat jelas dan kamu yakin kategorinya.
- sedang = benda terlihat tapi sebagian tertutup, buram, atau ambigu.
- rendah = kamu ragu. Lebih baik menjawab rendah daripada menebak dengan yakin —
  jawaban rendah membuat kiosk bertanya kepada anak alih-alih menyortir keliru."""

USER_PROMPT = "Benda apa ini?"


class VlmClassifier(Classifier):
    """Basis: menguraikan jawaban dan menjaga jalur cadangan. Subclass mengisi `_ask()`."""

    def __init__(self, version: str, fallback: Classifier | None = None):
        self._version = version
        self._fallback = fallback

    @property
    def model_loaded(self) -> bool:
        return True

    @abstractmethod
    def _ask(self, image_jpeg: bytes) -> str:
        """Kirim gambar ke penyedia, kembalikan teks JSON sesuai SCHEMA.

        Melempar exception apa pun bila jawaban tidak bisa dipakai — termasuk saat
        penyedia menolak atau memblokir. Pemanggil menangkapnya dan jatuh ke cadangan.
        """

    def _fall_back(self, image: Image.Image, why: str) -> Detection:
        if self._fallback is None:
            log.warning("VLM gagal (%s) dan tidak ada cadangan — objek dianggap tak terdeteksi", why)
            return Detection(None, 0.0, None, f"{self._version}-gagal")

        log.warning("VLM gagal (%s) — jatuh ke model lokal", why)
        result = self._fallback.classify(image)
        # Tandai bahwa yang menjawab adalah cadangan. Tanpa ini, kegagalan jaringan
        # terlihat identik dengan keberhasilan di sisi pemanggil.
        return Detection(
            category=result.category,
            confidence=result.confidence,
            bbox=result.bbox,
            model_version=f"{self._version}-cadangan-{result.model_version}",
            label=result.label,
        )

    def classify(self, image: Image.Image) -> Detection:
        buf = BytesIO()
        image.save(buf, format="JPEG", quality=85)

        try:
            text = self._ask(buf.getvalue())
        except Exception as e:  # noqa: BLE001 — apa pun yang gagal, kiosk harus tetap jalan
            return self._fall_back(image, f"{type(e).__name__}: {e}")

        try:
            data = json.loads(text)
            kategori = data["kategori"]
            nama = data["nama_objek"]
            yakin = data["yakin"]
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            return self._fall_back(image, f"JSON tak sesuai skema: {e}")

        # "none" adalah jawaban yang SAH, bukan kegagalan: frame memang tidak berisi
        # sampah. Jangan jatuh ke cadangan di sini — model lokal justru akan
        # memaksakan salah satu dari 9 kelasnya, persis perilaku yang ingin dihindari.
        if kategori == "none":
            log.info("VLM: tidak ada sampah di frame")
            return Detection(None, 0.0, None, self._version, label=None)

        return Detection(
            category=kategori,
            confidence=CERTAINTY.get(yakin, 0.40),
            bbox=None,  # VLM tidak mengembalikan kotak; overlay kiosk sudah tahan bbox=None
            model_version=self._version,
            label=nama,
        )


class AnthropicVlm(VlmClassifier):
    """Claude vision (CV_MODE=vlm)."""

    def __init__(self, api_key: str, model: str, timeout: float, fallback: Classifier | None = None):
        try:
            from anthropic import Anthropic
        except ImportError as e:
            raise RuntimeError(
                "CV_MODE=vlm membutuhkan package anthropic (pip install anthropic)"
            ) from e

        super().__init__(version=model, fallback=fallback)
        self._client = Anthropic(api_key=api_key, timeout=timeout, max_retries=1)
        self._model = model
        log.info(
            "VLM Claude siap: model=%s, timeout=%.1fs, cadangan=%s",
            model, timeout, type(fallback).__name__ if fallback else "TIDAK ADA",
        )

    def _ask(self, image_jpeg: bytes) -> str:
        response = self._client.messages.create(
            model=self._model,
            max_tokens=256,
            system=SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/jpeg",
                                "data": base64.b64encode(image_jpeg).decode(),
                            },
                        },
                        {"type": "text", "text": USER_PROMPT},
                    ],
                }
            ],
        )

        # Penolakan pengaman datang sebagai HTTP 200 dengan content kosong, BUKAN
        # exception. Membaca content[0] tanpa memeriksa ini akan melempar IndexError
        # pada respons yang sebenarnya sah.
        if response.stop_reason == "refusal":
            raise RuntimeError("stop_reason=refusal")

        text = next((b.text for b in response.content if b.type == "text"), None)
        if not text:
            raise RuntimeError("balasan tanpa blok teks")
        return text
