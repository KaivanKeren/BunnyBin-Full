"""Test jalur VLM — perilaku bersama, lalu yang khas tiap penyedia.

Tidak ada panggilan jaringan di sini. Test dibagi tiga karena itu mencerminkan
pembagian kodenya: keputusan bersama diuji sekali lewat subclass tiruan sehingga
berlaku untuk semua penyedia, dan tiap penyedia hanya diuji pada bagian yang
benar-benar khas — cara ia menolak permintaan.
"""

import json
from dataclasses import dataclass, field

import pytest
from PIL import Image

from app.inference.base import Classifier, Detection
from app.inference.gemini import GeminiVlm
from app.inference.vlm import AnthropicVlm, VlmClassifier


class StubFallback(Classifier):
    """Model lokal palsu — menandai dirinya supaya jalurnya bisa dibedakan."""

    def __init__(self):
        self.calls = 0

    @property
    def model_loaded(self) -> bool:
        return True

    def classify(self, image: Image.Image) -> Detection:
        self.calls += 1
        return Detection("inorganic", 0.88, (0.1, 0.1, 0.9, 0.9), "best", label="botol_plastik")


@pytest.fixture
def frame() -> Image.Image:
    return Image.new("RGB", (640, 480), (120, 120, 120))


def payload(kategori: str, nama: str, yakin: str) -> str:
    return json.dumps({"kategori": kategori, "nama_objek": nama, "yakin": yakin})


# ── Perilaku bersama (berlaku untuk SEMUA penyedia) ───────────────────────────


class FakeVlm(VlmClassifier):
    """Subclass tiruan: mengembalikan teks siap-pakai, atau melempar."""

    def __init__(self, text: str | None = None, error: Exception | None = None, fallback=None):
        super().__init__(version="fake", fallback=fallback)
        self._text = text
        self._error = error

    def _ask(self, image_jpeg: bytes) -> str:
        if self._error is not None:
            raise self._error
        return self._text


def test_balasan_valid_jadi_detection(frame):
    d = FakeVlm(payload("inorganic", "Botol Plastik", "tinggi")).classify(frame)

    assert d.category == "inorganic"
    assert d.label == "Botol Plastik"
    assert d.confidence == 0.95
    assert d.bbox is None
    assert d.model_version == "fake"


def test_yakin_rendah_turun_di_bawah_ambang(frame):
    # 0.40 sengaja di bawah CV_CONFIDENCE_THRESHOLD (0.6) supaya endpoint
    # me-null-kan kategorinya dan kiosk memperlakukannya sebagai belum terdeteksi.
    assert FakeVlm(payload("organic", "Entah", "rendah")).classify(frame).confidence == 0.40


def test_none_bukan_kegagalan_dan_tidak_memanggil_cadangan(frame):
    # Frame tanpa sampah adalah jawaban SAH. Jatuh ke model lokal di sini justru
    # merugikan: ia akan memaksakan salah satu dari 9 kelasnya pada tangan kosong.
    fallback = StubFallback()

    d = FakeVlm(payload("none", "-", "tinggi"), fallback=fallback).classify(frame)

    assert d.category is None
    assert d.label is None
    assert fallback.calls == 0


def test_kegagalan_ask_jatuh_ke_cadangan(frame):
    fallback = StubFallback()

    d = FakeVlm(error=RuntimeError("koneksi putus"), fallback=fallback).classify(frame)

    assert fallback.calls == 1
    assert d.category == "inorganic"
    assert d.model_version == "fake-cadangan-best"


def test_json_tak_sesuai_skema_jatuh_ke_cadangan(frame):
    fallback = StubFallback()

    assert FakeVlm("{bukan json", fallback=fallback).classify(frame).model_version == "fake-cadangan-best"
    assert fallback.calls == 1


def test_tanpa_cadangan_kegagalan_jadi_tak_terdeteksi(frame):
    # Tanpa jaring pengaman, kegagalan HARUS jadi "tidak terdeteksi" — bukan
    # exception yang merambat ke Laravel dan memunculkan 503 di layar anak.
    d = FakeVlm(error=TimeoutError("lewat batas waktu"), fallback=None).classify(frame)

    assert d.category is None
    assert d.confidence == 0.0
    assert d.model_version == "fake-gagal"


# ── Khas Claude ───────────────────────────────────────────────────────────────


@dataclass
class ClaudeBlock:
    type: str
    text: str


@dataclass
class ClaudeResponse:
    content: list
    stop_reason: str = "end_turn"


class FakeClaudeMessages:
    def __init__(self, response):
        self._response = response
        self.last_kwargs = None

    def create(self, **kwargs):
        self.last_kwargs = kwargs
        return self._response


def make_claude(response, fallback=None) -> tuple[AnthropicVlm, FakeClaudeMessages]:
    clf = AnthropicVlm(api_key="palsu", model="claude-haiku-4-5", timeout=5.0, fallback=fallback)
    messages = FakeClaudeMessages(response)
    clf._client = type("FakeClient", (), {"messages": messages})()
    return clf, messages


def test_claude_refusal_jatuh_ke_cadangan_bukan_crash(frame):
    # Penolakan pengaman datang sebagai HTTP 200 dengan content kosong. Membaca
    # content[0] tanpa memeriksa stop_reason akan melempar IndexError.
    fallback = StubFallback()
    clf, _ = make_claude(ClaudeResponse(content=[], stop_reason="refusal"), fallback)

    assert clf.classify(frame).model_version.endswith("-cadangan-best")
    assert fallback.calls == 1


def test_claude_tidak_mengirim_effort_atau_thinking(frame):
    # Haiku 4.5 menolak parameter effort, dan konfigurasi thinking apa pun hanya
    # menambah latensi untuk klasifikasi dua kelas.
    clf, messages = make_claude(
        ClaudeResponse(content=[ClaudeBlock("text", payload("organic", "Kulit Pisang", "tinggi"))])
    )

    clf.classify(frame)

    assert "effort" not in messages.last_kwargs.get("output_config", {})
    assert "thinking" not in messages.last_kwargs
    assert messages.last_kwargs["output_config"]["format"]["type"] == "json_schema"


# ── Khas Gemini ───────────────────────────────────────────────────────────────


@dataclass
class GeminiFeedback:
    block_reason: str | None = None


@dataclass
class GeminiCandidate:
    finish_reason: str | None = "STOP"


@dataclass
class GeminiResponse:
    text: str | None = None
    candidates: list = field(default_factory=lambda: [GeminiCandidate()])
    prompt_feedback: GeminiFeedback | None = None


class FakeGeminiModels:
    def __init__(self, response):
        self._response = response
        self.last_kwargs = None

    def generate_content(self, **kwargs):
        self.last_kwargs = kwargs
        return self._response


def make_gemini(response, fallback=None) -> tuple[GeminiVlm, FakeGeminiModels]:
    clf = GeminiVlm(api_key="palsu", model="gemini-2.5-flash", timeout=5.0, fallback=fallback)
    models = FakeGeminiModels(response)
    clf._client = type("FakeClient", (), {"models": models})()
    return clf, models


def test_gemini_balasan_normal(frame):
    clf, _ = make_gemini(GeminiResponse(text=payload("organic", "Daun Kering", "sedang")))

    d = clf.classify(frame)

    assert d.category == "organic"
    assert d.label == "Daun Kering"
    assert d.confidence == 0.70
    assert d.model_version == "gemini-2.5-flash"


def test_gemini_prompt_diblokir_jatuh_ke_cadangan(frame):
    # Jalur pemblokiran 1: permintaannya ditolak, tidak ada kandidat sama sekali.
    fallback = StubFallback()
    clf, _ = make_gemini(
        GeminiResponse(text=None, candidates=[], prompt_feedback=GeminiFeedback(block_reason="SAFETY")),
        fallback,
    )

    assert clf.classify(frame).model_version.endswith("-cadangan-best")
    assert fallback.calls == 1


@pytest.mark.parametrize("reason", ["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "MAX_TOKENS"])
def test_gemini_finish_reason_buruk_jatuh_ke_cadangan(frame, reason):
    # Jalur pemblokiran 2: jawaban dihentikan di tengah. HTTP tetap 200, dan
    # `text` bisa saja berisi JSON separuh — mengurainya menghasilkan sampah
    # yang tampak seperti deteksi sah.
    fallback = StubFallback()
    clf, _ = make_gemini(
        GeminiResponse(text='{"kategori":"organic"', candidates=[GeminiCandidate(finish_reason=reason)]),
        fallback,
    )

    assert clf.classify(frame).model_version.endswith("-cadangan-best")
    assert fallback.calls == 1


def test_gemini_timeout_dikirim_dalam_milidetik(monkeypatch):
    # HttpOptions.timeout bersatuan MILIDETIK. Meneruskan 12.0 apa adanya memberi
    # batas 12 ms — setiap panggilan gagal dan kiosk diam-diam berjalan sepenuhnya
    # di model cadangan, tanpa satu pun error yang terlihat.
    from google import genai

    captured = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(genai, "Client", FakeClient)

    GeminiVlm(api_key="palsu", model="gemini-2.5-flash", timeout=12.0)

    assert captured["http_options"].timeout == 12_000


def test_gemini_mengirim_skema_json_dan_pelonggaran_safety(frame):
    clf, models = make_gemini(GeminiResponse(text=payload("inorganic", "Masker", "tinggi")))

    clf.classify(frame)

    config = models.last_kwargs["config"]
    assert config.response_mime_type == "application/json"
    # Filter default mudah salah-tandai foto anak; pelonggaran ini disengaja.
    assert all(s.threshold == "BLOCK_ONLY_HIGH" for s in config.safety_settings)

    # REGRESI: Gemini menolak `additionalProperties` dengan 400 INVALID_ARGUMENT,
    # sementara Anthropic mewajibkannya. Ditemukan lewat uji asap — dan sempat
    # tersamar sepenuhnya, karena jalur cadangan membuat kiosk tetap menjawab
    # seolah tidak terjadi apa-apa.
    assert "additionalProperties" not in config.response_schema
    assert set(config.response_schema["properties"]) == {"kategori", "nama_objek", "yakin"}


def test_skema_gemini_tetap_ikut_saat_skema_bersama_berubah():
    # GEMINI_SCHEMA diturunkan dari SCHEMA, bukan disalin manual. Test ini menjaga
    # keduanya tidak menyimpang diam-diam saat field ditambah di vlm.py.
    from app.inference.gemini import GEMINI_SCHEMA
    from app.inference.vlm import SCHEMA

    assert GEMINI_SCHEMA["properties"] == SCHEMA["properties"]
    assert GEMINI_SCHEMA["required"] == SCHEMA["required"]
