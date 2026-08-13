"""Test jalur VLM — perilaku bersama, lalu yang khas tiap penyedia.

Tidak ada panggilan jaringan di sini. Test dibagi tiga karena itu mencerminkan
pembagian kodenya: keputusan bersama diuji sekali lewat subclass tiruan sehingga
berlaku untuk semua penyedia, dan tiap penyedia hanya diuji pada bagian yang
benar-benar khas — cara ia menolak permintaan.
"""

import json
from dataclasses import dataclass, field
from io import BytesIO

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

    def __init__(
        self,
        text: str | None = None,
        error: Exception | None = None,
        fallback=None,
        max_rpm: int = 0,
        cache_ttl_s: float = 0.0,
        max_tpm: int = 0,
        max_image_px: int = 0,
    ):
        super().__init__(
            version="fake", fallback=fallback, max_rpm=max_rpm, cache_ttl_s=cache_ttl_s,
            max_tpm=max_tpm, max_image_px=max_image_px,
        )
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

    # Token thinking ikut memakan max_output_tokens. Pada 256, sebagian panggilan
    # berhenti di MAX_TOKENS sebelum menulis JSON-nya — terpantau saat uji hidup.
    assert config.max_output_tokens >= 1024

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


# ── Pemutus kuota (429) ───────────────────────────────────────────────────────
#
# Ini perilaku yang paling mahal saat rusak. Free tier Gemini memberi 10
# permintaan/menit sementara loop kiosk memanggil ~13 kali/menit, jadi 429 BUKAN
# kasus tepi — ia keadaan normal setelah menit pertama demo yang ramai. Sebelum
# ada pemutus, tiap 429 ditangkap sebagai "gagal biasa" dan kiosk menembakkan
# permintaan yang sudah pasti ditolak tiap 2 detik, sepanjang hari.


class FakeApiError(Exception):
    """Meniru bentuk error SDK: kode status sebagai atribut, bukan tipe khusus."""

    def __init__(self, code: int, status: str = "", details: str = ""):
        super().__init__(f"{code} {status}")
        self.code = code
        self.status = status
        self.details = details


def test_429_membuka_pemutus_dan_menghentikan_panggilan_berikutnya(frame):
    fallback = StubFallback()
    clf = FakeVlm(error=FakeApiError(429, "RESOURCE_EXHAUSTED"), fallback=fallback)

    first = clf.classify(frame)
    assert first.degraded is True
    assert first.degraded_reason == "kuota"
    assert clf.stats.quota_hits == 1
    assert clf.stats.calls == 1

    # Panggilan kedua TIDAK boleh menyentuh API sama sekali: kuotanya sudah habis,
    # dan menembaknya lagi hanya menambah round-trip gagal ke tiap pemindaian.
    second = clf.classify(frame)
    assert second.degraded_reason == "kuota"
    assert clf.stats.calls == 1, "pemutus terbuka tapi permintaan tetap dikirim"
    assert clf.stats.skipped_quota == 1
    assert clf.quota_blocked_for > 0

    # Anak tetap mendapat jawaban — dari model lokal, dan ditandai apa adanya.
    assert second.category == "inorganic"
    assert fallback.calls == 2


def test_pemutus_memakai_retry_delay_yang_diminta_penyedia(frame):
    # google.rpc.RetryInfo menyebut jedanya sendiri. Angka penyedia selalu lebih
    # baik daripada tebakan backoff kita.
    clf = FakeVlm(
        error=FakeApiError(429, "RESOURCE_EXHAUSTED", details='{"retryDelay": "31s"}'),
        fallback=StubFallback(),
    )

    clf.classify(frame)

    assert 30 < clf.quota_blocked_for <= 31


def test_backoff_melipat_saat_kuota_tak_kunjung_pulih(frame, monkeypatch):
    # Satu kode 429 tidak memberi tahu batas MANA yang tersentuh. Habis per-menit
    # pulih dalam 60 dtk; habis per-hari tidak pulih sampai besok. Melipatgandakan
    # jeda menangani keduanya tanpa perlu membedakan.
    import app.inference.vlm as vlm

    now = [1000.0]
    monkeypatch.setattr(vlm.time, "monotonic", lambda: now[0])

    clf = FakeVlm(error=FakeApiError(429), fallback=StubFallback())

    clf.classify(frame)
    assert clf.quota_blocked_for == vlm.QUOTA_COOLDOWN_S

    now[0] += vlm.QUOTA_COOLDOWN_S + 1  # jeda lewat, coba lagi, masih 429
    clf.classify(frame)
    assert clf.quota_blocked_for == vlm.QUOTA_COOLDOWN_S * 2

    now[0] += 10_000  # tetap 429 berkali-kali — jangan tumbuh tanpa batas
    for _ in range(12):
        clf.classify(frame)
        now[0] += clf.quota_blocked_for + 1
    assert clf.quota_blocked_for <= vlm.QUOTA_COOLDOWN_MAX_S


def test_pemutus_menutup_lagi_setelah_panggilan_berhasil(frame, monkeypatch):
    import app.inference.vlm as vlm

    now = [1000.0]
    monkeypatch.setattr(vlm.time, "monotonic", lambda: now[0])

    clf = FakeVlm(error=FakeApiError(429), fallback=StubFallback())
    clf.classify(frame)
    assert clf.quota_blocked_for > 0

    # Kuota pulih: jeda lewat dan API menjawab normal lagi.
    now[0] += vlm.QUOTA_COOLDOWN_S + 1
    clf._error = None
    clf._text = payload("organic", "Kulit Pisang", "tinggi")

    d = clf.classify(frame)

    assert d.degraded is False
    assert d.degraded_reason is None
    assert clf.quota_blocked_for == 0, "pemutus harus tertutup setelah sukses"
    # Backoff ikut ter-reset — kena 429 lagi besok mulai dari 60 dtk, bukan 900.
    clf._error = FakeApiError(429)
    clf.classify(frame)
    assert clf.quota_blocked_for == vlm.QUOTA_COOLDOWN_S


def test_kegagalan_jaringan_bukan_kuota_tidak_membuka_pemutus(frame):
    # Kabel LAN tercabut harus dicoba lagi di frame berikutnya. Menyamakannya
    # dengan kuota habis akan mematikan jalur cloud selama semenit karena satu
    # paket yang hilang.
    clf = FakeVlm(error=TimeoutError("lewat batas"), fallback=StubFallback())

    d = clf.classify(frame)

    assert d.degraded_reason == "jaringan"
    assert clf.quota_blocked_for == 0
    assert clf.stats.quota_hits == 0

    clf.classify(frame)
    assert clf.stats.calls == 2, "kegagalan jaringan tidak boleh menghentikan percobaan"


def test_alasan_degradasi_membedakan_pemblokiran_dari_jaringan(frame):
    # Pemblokiran berulang berarti frame kiosk memicu filter keamanan — dan frame
    # kiosk berisi anak-anak. Digabung ke "jaringan", pola itu tak akan terlihat.
    from app.inference.vlm import ProviderBlocked

    d = FakeVlm(error=ProviderBlocked("IMAGE_SAFETY"), fallback=StubFallback()).classify(frame)

    assert d.degraded_reason == "diblokir"


def test_jawaban_sukses_tidak_pernah_ditandai_degraded(frame):
    d = FakeVlm(payload("inorganic", "Kaleng", "tinggi"), fallback=StubFallback()).classify(frame)

    assert d.degraded is False
    assert d.degraded_reason is None


def test_none_tidak_dihitung_sebagai_degradasi(frame):
    # Frame tanpa sampah adalah jawaban SAH dari jalur utama.
    d = FakeVlm(payload("none", "-", "tinggi"), fallback=StubFallback()).classify(frame)

    assert d.degraded is False


def test_health_memaparkan_keadaan_kuota(frame):
    clf = FakeVlm(error=FakeApiError(429), fallback=StubFallback())
    clf.classify(frame)

    h = clf.health()

    assert h["quota_hits"] == 1
    assert h["fallback"] == 1
    assert h["quota_blocked_for_s"] > 0
    assert h["fallback_available"] is True


def test_gemini_mengangkat_429_sdk_jadi_quota_exhausted(frame):
    # Yang khas Gemini: 429 datang sebagai exception dari SDK, bukan respons.
    fallback = StubFallback()
    clf, _ = make_gemini(GeminiResponse(text=payload("organic", "Daun", "tinggi")), fallback)

    def boom(**kwargs):
        raise FakeApiError(429, "RESOURCE_EXHAUSTED", '{"retryDelay": "22s"}')

    clf._client = type("FakeClient", (), {"models": type("M", (), {"generate_content": staticmethod(boom)})()})()

    d = clf.classify(frame)

    assert d.degraded_reason == "kuota"
    assert 21 < clf.quota_blocked_for <= 22


# ── Ekonomi panggilan: cache frame & batas laju sendiri ───────────────────────
#
# Dua mekanisme yang mengurangi JUMLAH panggilan, bukan menangani kegagalannya.
# Pemutus di atas bereaksi setelah 429; yang di sini mencegahnya terjadi.


def solid(color: tuple[int, int, int]) -> Image.Image:
    return Image.new("RGB", (640, 480), color)


def noisy(seed: int) -> Image.Image:
    """Frame dengan pola yang jelas berbeda — dHash-nya harus berjauhan."""
    import random

    rng = random.Random(seed)
    img = Image.new("RGB", (64, 64))
    img.putdata([(rng.randrange(256), rng.randrange(256), rng.randrange(256)) for _ in range(64 * 64)])
    return img.resize((640, 480))


def test_frame_identik_tidak_memanggil_api_dua_kali(frame):
    # Satu sortiran normal mengirim 2-3 frame yang secara persepsi sama karena
    # anak memegang bendanya diam. Membayar tiga panggilan untuk satu jawaban
    # adalah tiga kali lipat konsumsi kuota tanpa satu pun manfaat.
    clf = FakeVlm(payload("inorganic", "Botol Plastik", "tinggi"), cache_ttl_s=15.0)

    first = clf.classify(frame)
    second = clf.classify(frame)

    assert clf.stats.calls == 1
    assert clf.stats.cache_hits == 1
    assert second.label == first.label == "Botol Plastik"


def test_frame_berbeda_tetap_memanggil_api():
    # Ambang kemiripan harus cukup ketat: anak yang mengganti benda WAJIB
    # mendapat jawaban baru, bukan jawaban benda sebelumnya.
    clf = FakeVlm(payload("organic", "Kulit Pisang", "tinggi"), cache_ttl_s=15.0)

    clf.classify(noisy(1))
    clf.classify(noisy(2))

    assert clf.stats.calls == 2
    assert clf.stats.cache_hits == 0


def test_cache_kedaluwarsa_setelah_ttl(frame, monkeypatch):
    import app.inference.vlm as vlm

    now = [1000.0]
    monkeypatch.setattr(vlm.time, "monotonic", lambda: now[0])

    clf = FakeVlm(payload("inorganic", "Kaleng", "tinggi"), cache_ttl_s=15.0)
    clf.classify(frame)
    now[0] += 16.0
    clf.classify(frame)

    assert clf.stats.calls == 2


def test_jawaban_cadangan_tidak_pernah_di_cache(frame):
    # Menyimpan hasil cadangan akan mengunci mutu yang lebih rendah selama TTL,
    # bahkan setelah jalur utama pulih — kegagalan sesaat yang memperpanjang diri.
    clf = FakeVlm(error=TimeoutError("putus"), fallback=StubFallback(), cache_ttl_s=15.0)

    clf.classify(frame)
    clf._error = None
    clf._text = payload("organic", "Daun", "tinggi")
    d = clf.classify(frame)

    assert d.degraded is False
    assert d.label == "Daun"
    assert clf.stats.cache_hits == 0


def test_none_ikut_di_cache(frame):
    # Kamera yang menyorot meja kosong adalah keadaan paling sering di kiosk yang
    # menyala seharian, dan frame-nya paling stabil — justru yang paling untung
    # untuk tidak ditanyakan berulang.
    clf = FakeVlm(payload("none", "-", "tinggi"), cache_ttl_s=15.0)

    clf.classify(frame)
    d = clf.classify(frame)

    assert clf.stats.calls == 1
    assert clf.stats.cache_hits == 1
    assert d.category is None


def test_cache_mati_secara_bawaan(frame):
    clf = FakeVlm(payload("inorganic", "Kaca", "tinggi"))

    clf.classify(frame)
    clf.classify(frame)

    assert clf.stats.calls == 2


def test_batas_laju_menahan_panggilan_sebelum_penyedia_menolak():
    # Ini mencegah 429, bukan menanganinya. Free tier memberi 10/menit sementara
    # loop kiosk menghasilkan ~13 — kelebihannya harus ditahan di sini, bukan
    # dibayar sebagai perjalanan bolak-balik yang ditolak.
    clf = FakeVlm(payload("inorganic", "Sedotan", "tinggi"), fallback=StubFallback(), max_rpm=3)

    results = [clf.classify(noisy(i)) for i in range(5)]

    assert clf.stats.calls == 3
    assert clf.stats.skipped_rate == 2
    assert results[3].degraded_reason == "batas-laju"
    # Anak tetap dapat jawaban — dari model lokal, ditandai apa adanya.
    assert results[4].category == "inorganic"


def test_jendela_batas_laju_bergeser(monkeypatch):
    import app.inference.vlm as vlm

    now = [1000.0]
    monkeypatch.setattr(vlm.time, "monotonic", lambda: now[0])

    clf = FakeVlm(payload("organic", "Rumput", "tinggi"), fallback=StubFallback(), max_rpm=2)

    clf.classify(noisy(1))
    clf.classify(noisy(2))
    clf.classify(noisy(3))
    assert clf.stats.calls == 2

    now[0] += 61.0  # jendela 60 dtk lewat — jatah pulih penuh
    clf.classify(noisy(4))
    assert clf.stats.calls == 3


def test_batas_laju_mati_saat_nol(frame):
    clf = FakeVlm(payload("inorganic", "Masker", "tinggi"), max_rpm=0)

    for i in range(20):
        clf.classify(noisy(i))

    assert clf.stats.calls == 20
    assert clf.stats.skipped_rate == 0


# ── Khas OpenAI-compatible (Groq / Ollama / OpenRouter) ───────────────────────
#
# Satu class untuk semua penyedia berprotokol /chat/completions. Yang diuji di
# sini hanya yang khas protokolnya: bentuk permintaan, Retry-After standar HTTP,
# dua wajah penolakan (refusal / content_filter), dan autentikasi opsional.


import httpx

from app.inference.openai_compat import JSON_INSTRUCTION, OpenAiCompatVlm


def openai_reply(content, finish_reason="stop", refusal=None):
    message = {"role": "assistant", "content": content}
    if refusal is not None:
        message["refusal"] = refusal
    return {"choices": [{"message": message, "finish_reason": finish_reason}]}


def make_openai(
    handler,
    api_key="gsk_palsu",
    fallback=None,
    json_mode="schema",
    **kwargs,
) -> OpenAiCompatVlm:
    clf = OpenAiCompatVlm(
        base_url="https://api.contoh.test/openai/v1",
        api_key=api_key,
        model="qwen/qwen3.6-27b",
        timeout=5.0,
        fallback=fallback,
        json_mode=json_mode,
        **kwargs,
    )
    headers = dict(clf._client.headers)
    clf._client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://api.contoh.test/openai/v1",
        headers=headers,
    )
    return clf


def test_openai_balasan_normal_dan_bentuk_permintaan(frame):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=openai_reply(payload("inorganic", "Botol Plastik", "tinggi")))

    d = make_openai(handler).classify(frame)

    assert d.category == "inorganic"
    assert d.label == "Botol Plastik"
    assert d.confidence == 0.95
    assert d.degraded is False

    assert seen["url"].endswith("/chat/completions")
    assert seen["auth"] == "Bearer gsk_palsu"
    body = seen["body"]
    # Skema strict dikirim, dan `additionalProperties` yang ditolak Gemini
    # justru wajib ada di sini.
    assert body["response_format"]["json_schema"]["strict"] is True
    assert body["response_format"]["json_schema"]["schema"]["additionalProperties"] is False
    # Instruksi JSON ditempel ke system prompt — pertahanan untuk server yang
    # mengabaikan response_format.
    assert body["messages"][0]["content"].endswith(JSON_INSTRUCTION)
    assert body["messages"][1]["content"][0]["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_openai_tanpa_api_key_tidak_mengirim_authorization(frame):
    # Ollama/llama.cpp lokal tidak punya API key. Header kosong "Bearer " justru
    # ditolak sebagian server — headernya harus TIDAK ADA sama sekali.
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json=openai_reply(payload("organic", "Daun", "tinggi")))

    make_openai(handler, api_key="").classify(frame)

    assert seen["auth"] is None


def test_openai_json_mode_off_tidak_mengirim_response_format(frame):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=openai_reply(payload("organic", "Daun", "tinggi")))

    make_openai(handler, json_mode="off").classify(frame)

    assert "response_format" not in seen["body"]


def test_openai_429_membuka_pemutus_dengan_retry_after(frame):
    # Retry-After standar HTTP, bukan google.rpc.RetryInfo — jalur uraiannya
    # berbeda dan harus sampai ke pemutus yang sama.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, text="rate limit", headers={"Retry-After": "42"})

    clf = make_openai(handler, fallback=StubFallback())
    d = clf.classify(frame)

    assert d.degraded_reason == "kuota"
    assert 41 < clf.quota_blocked_for <= 42
    assert clf.stats.quota_hits == 1


def test_openai_refusal_dan_content_filter_jadi_diblokir(frame):
    responses = [
        openai_reply(None, refusal="tidak bisa membantu"),
        openai_reply(None, finish_reason="content_filter"),
    ]

    for reply in responses:
        d = make_openai(
            lambda request, r=reply: httpx.Response(200, json=r),
            fallback=StubFallback(),
        ).classify(frame)
        assert d.degraded_reason == "diblokir"


def test_openai_http_500_jatuh_sebagai_jaringan(frame):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="<html>halaman error panjang</html>")

    d = make_openai(handler, fallback=StubFallback()).classify(frame)

    assert d.degraded_reason == "jaringan"


def test_openai_blok_think_dibuang_sebelum_diurai(frame):
    # Model thinking (Qwen) kadang membungkus jawaban dengan <think>…</think>
    # walau diminta JSON murni.
    content = "<think>hmm, ini botol…</think>\n" + payload("inorganic", "Botol Plastik", "tinggi")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_reply(content))

    d = make_openai(handler).classify(frame)

    assert d.category == "inorganic"
    assert d.degraded is False


def test_openai_content_berbentuk_daftar_bagian(frame):
    # Bentuk sah di spek yang jarang dipakai: content = daftar {type, text}.
    parts = [{"type": "text", "text": payload("organic", "Kulit Pisang", "sedang")}]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=openai_reply(parts))

    d = make_openai(handler).classify(frame)

    assert d.label == "Kulit Pisang"
    assert d.confidence == 0.70


# ── Batas TOKEN (TPM) & pengecilan gambar ─────────────────────────────────────
#
# Pelajaran dari lapangan: untuk beban GAMBAR, yang habis lebih dulu adalah token
# per menit, BUKAN permintaan per menit. Terukur di Groq — plafon 30 rpm, tapi
# TPM 8.000; rem berbasis permintaan yang disetel 25 tidak pernah aktif sekali pun
# sementara 429 tetap datang.


GROQ_429 = (
    "429: {\"error\":{\"message\":\"Rate limit reached for model "
    "`qwen/qwen3.6-27b` in organization `org_x` service tier `on_demand` on "
    "tokens per minute (TPM): Limit 8000, Used 4314, Requested 1500\"}}"
)


class TokenReportingVlm(FakeVlm):
    """Penyedia tiruan yang melaporkan pemakaian token, seperti Groq."""

    def __init__(self, tokens: int, **kwargs):
        super().__init__(payload("inorganic", "Botol Plastik", "tinggi"), **kwargs)
        self._tokens = tokens

    def _ask(self, image_jpeg: bytes) -> str:
        self._note_usage(self._tokens)
        return super()._ask(image_jpeg)


def test_plafon_tpm_dipelajari_dari_pesan_429(frame):
    # Angka plafon TIDAK ditebak maupun dikonfigurasi: penyedia menyebutkannya
    # sendiri saat menolak, dan itu satu-satunya sumber yang tidak bisa usang.
    clf = FakeVlm(error=FakeApiError(429, "", GROQ_429), fallback=StubFallback())
    assert clf._max_tpm == 0

    clf.classify(frame)

    assert clf._max_tpm == 8000
    assert clf.health()["max_tpm"] == 8000


def test_rem_token_menahan_sebelum_penyedia_menolak(frame):
    # Inti perbaikannya. Dengan plafon 8.000 dan ~1.400 token per frame, jatah
    # sesungguhnya ±5 panggilan/menit — bukan 25 seperti dugaan rem lama.
    clf = TokenReportingVlm(1400, fallback=StubFallback(), max_tpm=8000, max_rpm=100)

    results = [clf.classify(noisy(i)) for i in range(8)]

    # 8000 * 0.85 = 6800 anggaran; berhenti sebelum 1400 berikutnya melewatinya.
    assert clf.stats.calls == 4
    assert clf.stats.skipped_tokens == 4
    assert results[-1].degraded_reason == "batas-token"
    # Rem lama (permintaan/menit) tidak pernah tersentuh — persis gejala lapangan.
    assert clf.stats.skipped_rate == 0


def test_penolakan_429_ikut_membakar_jatah_token(frame):
    # Permintaan yang DITOLAK tetap memakai sebagian jatah. Tanpa dicatat, rem
    # mengira jatahnya masih utuh dan langsung menembak lagi begitu pemutus
    # tertutup — menghasilkan 429 berikutnya.
    clf = FakeVlm(error=FakeApiError(429, "", GROQ_429), fallback=StubFallback())

    clf.classify(frame)

    assert clf._tokens_recent() > 0


def test_perkiraan_token_memakai_yang_terbesar_bukan_rata_rata(frame):
    # Meleset ke bawah berarti 429, yang membekukan jalur cloud untuk SEMUA frame
    # sesudahnya — bukan cuma frame yang meleset itu.
    clf = TokenReportingVlm(500, max_tpm=100_000, max_rpm=0)
    clf.classify(noisy(1))
    clf._tokens = 3000
    clf.classify(noisy(2))

    assert clf._token_estimate() == 3000


def test_jendela_token_bergeser_setelah_semenit(monkeypatch):
    import app.inference.vlm as vlm

    now = [1000.0]
    monkeypatch.setattr(vlm.time, "monotonic", lambda: now[0])

    clf = TokenReportingVlm(1400, fallback=StubFallback(), max_tpm=8000)
    for i in range(6):
        clf.classify(noisy(i))
    assert clf.stats.skipped_tokens > 0

    now[0] += 61.0  # jendela lewat — jatah token pulih penuh
    before = clf.stats.calls
    clf.classify(noisy(99))
    assert clf.stats.calls == before + 1


def test_rem_token_mati_saat_plafon_belum_diketahui(frame):
    # Sebelum 429 pertama, plafonnya memang tidak diketahui. Menebak-nebak di sini
    # akan menahan panggilan yang sebenarnya masih boleh lewat.
    clf = TokenReportingVlm(5000, max_tpm=0, max_rpm=0)

    for i in range(10):
        clf.classify(noisy(i))

    assert clf.stats.calls == 10
    assert clf.stats.skipped_tokens == 0


def test_gambar_dikecilkan_sebelum_dikirim():
    # Biaya token naik seiring luas piksel, dan token per menit adalah batas yang
    # sungguh habis lebih dulu — jadi resolusi berlebih dibayar sebagai lebih
    # sedikit deteksi yang muat dalam satu menit.
    seen = {}

    class Capturing(FakeVlm):
        def _ask(self, image_jpeg: bytes) -> str:
            seen["size"] = Image.open(BytesIO(image_jpeg)).size
            return payload("inorganic", "Botol", "tinggi")

    clf = Capturing(max_image_px=512)
    clf.classify(Image.new("RGB", (1920, 1080), (100, 100, 100)))

    assert max(seen["size"]) == 512
    # Rasio aspek dipertahankan — meregangkan gambar mengubah bentuk benda.
    assert seen["size"] == (512, 288)


def test_gambar_kecil_tidak_diperbesar():
    seen = {}

    class Capturing(FakeVlm):
        def _ask(self, image_jpeg: bytes) -> str:
            seen["size"] = Image.open(BytesIO(image_jpeg)).size
            return payload("inorganic", "Botol", "tinggi")

    Capturing(max_image_px=512).classify(Image.new("RGB", (320, 240)))

    assert seen["size"] == (320, 240)


def test_cadangan_tetap_menerima_gambar_ASLI():
    # YoloClassifier harus dijalankan pada resolusi latihnya. Mengirimkan salinan
    # yang sudah dikecilkan ke cadangan akan menurunkan akurasinya diam-diam,
    # persis saat jalur utama sedang bermasalah.
    seen = {}

    class SizeCheckingFallback(Classifier):
        @property
        def model_loaded(self) -> bool:
            return True

        def classify(self, image):
            seen["size"] = image.size
            return Detection("inorganic", 0.9, None, "best", label="botol_plastik")

    clf = FakeVlm(
        error=TimeoutError("putus"), fallback=SizeCheckingFallback(), max_image_px=512
    )
    clf.classify(Image.new("RGB", (1920, 1080)))

    assert seen["size"] == (1920, 1080)


def test_openai_reasoning_effort_dikirim_saat_diminta(frame):
    # TERUKUR terhadap Groq: thinking bawaan menulis 677 token demi jawaban JSON
    # yang isinya ~40 token (1,44 dtk). Dengan "none": 46 token, 0,22 dtk.
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=openai_reply(payload("inorganic", "Kaleng", "tinggi")))

    make_openai(handler, reasoning_effort="none").classify(frame)

    assert seen["body"]["reasoning_effort"] == "none"


def test_openai_reasoning_effort_tidak_dikirim_secara_bawaan(frame):
    # Server yang tidak mengenal parameter ini membalas 400, dan penolakan itu
    # berakhir sebagai kegagalan SENYAP — semua frame dilayani model cadangan.
    # Jadi ia hanya dikirim bila diminta eksplisit.
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json=openai_reply(payload("inorganic", "Kaleng", "tinggi")))

    make_openai(handler).classify(frame)

    assert "reasoning_effort" not in seen["body"]


def test_openai_melaporkan_pemakaian_token_ke_rem(frame):
    # `usage` dari penyedia inilah yang membuat rem token berhenti menebak.
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                **openai_reply(payload("organic", "Daun", "tinggi")),
                "usage": {"total_tokens": 1857},
            },
        )

    clf = make_openai(handler)
    clf.classify(frame)

    assert clf._tokens_recent() == 1857
    assert clf.health()["token_estimate"] == 1857
