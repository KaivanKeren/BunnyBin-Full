import base64
import os
from io import BytesIO

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from app.config import get_settings
from app.inference.base import Classifier, Detection
from app.main import app, build_classifier


TOKEN = "token-internal-untuk-test"


@pytest.fixture(autouse=True)
def classifier(monkeypatch):
    # Lifespan tidak jalan via ASGITransport — pasang classifier manual.
    monkeypatch.setenv("CV_INTERNAL_TOKEN", TOKEN)
    # CV_MODE dipatok eksplisit karena Settings membaca .env: tanpa ini, test
    # ikut memakai mode yang kebetulan sedang dipakai developer, dan suite bisa
    # mencoba memanggil API cloud sungguhan. Environment variable menang atas
    # .env, jadi satu baris ini cukup untuk membuat test hermetis.
    monkeypatch.setenv("CV_MODE", "dummy")
    get_settings.cache_clear()
    app.state.classifier = build_classifier(get_settings())
    yield
    get_settings.cache_clear()


@pytest.fixture
async def client():
    """Client yang SUDAH terautentikasi — /classify menolak tanpa header ini."""
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-Internal-Token": TOKEN},
    ) as c:
        yield c


@pytest.fixture
async def anon_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


def image_b64(color: int) -> str:
    buf = BytesIO()
    Image.new("RGB", (64, 64), (color, color, color)).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


async def test_dark_image_is_organic(client):
    resp = await client.post("/classify", json={"image_base64": image_b64(30)})

    assert resp.status_code == 200
    body = resp.json()
    assert body["category"] == "organic"
    assert body["confidence"] == 0.85
    assert body["model_version"] == "dummy-1"


async def test_bright_image_is_inorganic(client):
    resp = await client.post("/classify", json={"image_base64": image_b64(220)})

    assert resp.status_code == 200
    assert resp.json()["category"] == "inorganic"


async def test_invalid_base64_returns_422(client):
    resp = await client.post("/classify", json={"image_base64": "bukan-base64!!!"})

    assert resp.status_code == 422


async def test_non_image_payload_returns_422(client):
    payload = base64.b64encode(b"halo ini bukan gambar").decode()

    resp = await client.post("/classify", json={"image_base64": payload})

    assert resp.status_code == 422


async def test_oversize_image_returns_400(client, monkeypatch):
    monkeypatch.setenv("CV_MAX_IMAGE_MB", "1")
    get_settings.cache_clear()

    payload = base64.b64encode(os.urandom(2 * 1024 * 1024)).decode()

    resp = await client.post("/classify", json={"image_base64": payload})

    assert resp.status_code == 400


async def test_health(client):
    resp = await client.get("/health")

    assert resp.status_code == 200
    # `vlm` null di mode non-cloud: DummyClassifier tidak punya kuota untuk
    # dilaporkan. Di mode gemini/vlm field ini berisi penghitung panggilan dan
    # sisa jeda pemutus — permukaan yang membuat "kuota habis tiga jam lalu"
    # terlihat dalam satu curl, bukan disimpulkan dari akurasi yang memburuk.
    assert resp.json() == {
        "status": "ok",
        "mode": "dummy",
        "model_loaded": False,
        "vlm": None,
    }


# ── Autentikasi internal ──────────────────────────────────────────────────────


async def test_classify_without_token_is_rejected(anon_client):
    resp = await anon_client.post("/classify", json={"image_base64": image_b64(30)})

    assert resp.status_code == 401


async def test_classify_with_wrong_token_is_rejected(anon_client):
    resp = await anon_client.post(
        "/classify",
        json={"image_base64": image_b64(30)},
        headers={"X-Internal-Token": "token-keliru"},
    )

    assert resp.status_code == 401


async def test_health_stays_open_for_docker_healthcheck(anon_client):
    # HEALTHCHECK di Dockerfile memanggil endpoint ini tanpa kredensial.
    # Mengunci /health akan membuat container selalu dilaporkan unhealthy.
    resp = await anon_client.get("/health")

    assert resp.status_code == 200


async def test_service_refuses_to_start_without_a_token(monkeypatch):
    # Fail fast, bukan diam-diam terbuka: token kosong berarti /classify bisa
    # dipanggil siapa pun yang menjangkau portnya — kondisi yang justru sedang
    # dihilangkan. Pola yang sama dipakai YoloClassifier saat weight tak ada.
    from app.main import lifespan

    monkeypatch.setenv("CV_INTERNAL_TOKEN", "")
    get_settings.cache_clear()

    with pytest.raises(RuntimeError, match="CV_INTERNAL_TOKEN"):
        async with lifespan(app):
            pass


async def test_oversize_dimensions_are_rejected_before_decoding(client, monkeypatch):
    # Batas BYTE tidak melihat decompression bomb: PNG kecil bisa mendeklarasikan
    # dimensi raksasa yang baru mekar saat di-decode. Ambangnya diturunkan lewat
    # env supaya test tetap murah — yang diuji logikanya, bukan daya tahan RAM.
    monkeypatch.setenv("CV_MAX_PIXELS", "1000")
    get_settings.cache_clear()

    resp = await client.post("/classify", json={"image_base64": image_b64(30)})  # 64x64 = 4096 px

    assert resp.status_code == 422
    assert "melebihi" in resp.json()["detail"]


async def test_pillow_own_bomb_guard_becomes_422_not_500(client, monkeypatch):
    # Pillow melempar DecompressionBombError saat open untuk gambar yang sangat
    # besar. Tanpa ditangkap, bom yang berhasil ditolak justru muncul sebagai
    # HTTP 500 — kegagalan server untuk sesuatu yang penanganannya sudah benar.
    def boom(*args, **kwargs):
        raise Image.DecompressionBombError("terlalu besar")

    monkeypatch.setattr(Image, "open", boom)

    resp = await client.post("/classify", json={"image_base64": image_b64(30)})

    assert resp.status_code == 422


async def test_normal_kiosk_frame_still_passes(client):
    # Frame kiosk sesungguhnya 640 px — batas dimensi tidak boleh menyentuhnya.
    buf = BytesIO()
    Image.new("RGB", (640, 480), (30, 30, 30)).save(buf, format="JPEG")
    payload = base64.b64encode(buf.getvalue()).decode()

    resp = await client.post("/classify", json={"image_base64": payload})

    assert resp.status_code == 200


# ── Penanda degradasi & perekam frame ─────────────────────────────────────────


class DegradedStub(Classifier):
    """Classifier yang mengaku dilayani cadangan — persis bentuk jawaban saat
    kuota cloud habis."""

    @property
    def model_loaded(self) -> bool:
        return True

    def classify(self, image):
        return Detection(
            category="inorganic",
            confidence=0.88,
            bbox=None,
            model_version="gemini-3.5-flash-cadangan-best",
            label="botol_plastik",
            degraded=True,
            degraded_reason="kuota",
        )


async def test_degraded_diteruskan_ke_pemanggil(client):
    # Ini inti P0: tanpa field ini, kuota habis terlihat PERSIS seperti
    # keberhasilan di sepanjang jalur — Laravel, kiosk, dan layar anak semuanya
    # menampilkan hasil model cadangan dengan percaya diri yang sama.
    app.state.classifier = DegradedStub()

    body = (await client.post("/classify", json={"image_base64": image_b64(200)})).json()

    assert body["degraded"] is True
    assert body["degraded_reason"] == "kuota"
    assert body["category"] == "inorganic"  # anak tetap dapat jawaban


async def test_jawaban_normal_tidak_ditandai_degraded(client):
    body = (await client.post("/classify", json={"image_base64": image_b64(200)})).json()

    assert body["degraded"] is False
    assert body["degraded_reason"] is None


async def test_capture_menyimpan_frame_dan_sidecar(client, monkeypatch, tmp_path):
    # Perekam ini satu-satunya sumber data lapangan. Metrik training diukur pada
    # split dataset publik yang sama dengan train split-nya, jadi tanpa frame dari
    # kamera kiosk sungguhan tidak ada angka yang bisa dipakai menilai apa pun.
    monkeypatch.setenv("CV_CAPTURE_DIR", str(tmp_path))
    get_settings.cache_clear()

    await client.post("/classify", json={"image_base64": image_b64(200)})

    images = list(tmp_path.rglob("*.jpg"))
    sidecars = list(tmp_path.rglob("*.json"))
    assert len(images) == 1
    assert len(sidecars) == 1

    import json as _json

    record = _json.loads(sidecars[0].read_text(encoding="utf-8"))
    assert record["predicted"]["category"] == "inorganic"
    # Kebenaran dibiarkan null — itu kerja manusia, dan field yang ADA tapi null
    # membuat "berapa yang belum dilabeli" bisa dihitung.
    assert record["truth_label"] is None
    assert record["truth_category"] is None


async def test_capture_mati_secara_bawaan(client, tmp_path):
    # Menyimpan gambar anak-anak harus keputusan sadar, bukan perilaku bawaan.
    await client.post("/classify", json={"image_base64": image_b64(200)})

    assert list(tmp_path.rglob("*.jpg")) == []


async def test_gagal_menyimpan_tidak_menggagalkan_klasifikasi(client, monkeypatch, tmp_path):
    # Disk penuh saat demo harus berakhir sebagai satu baris warning, bukan
    # sebagai kiosk yang berhenti menjawab.
    monkeypatch.setenv("CV_CAPTURE_DIR", str(tmp_path / "target"))
    get_settings.cache_clear()

    # Payload dibuat DULU: image_b64 juga memakai Image.save, jadi menambal
    # method itu lebih dulu akan menjatuhkan test pada baris yang tidak diuji.
    payload = image_b64(200)

    def boom(*args, **kwargs):
        raise OSError("disk penuh")

    monkeypatch.setattr(Image.Image, "save", boom)

    resp = await client.post("/classify", json={"image_base64": payload})

    assert resp.status_code == 200
    assert resp.json()["category"] == "inorganic"
