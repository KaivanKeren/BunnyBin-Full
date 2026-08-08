import base64
import os
from io import BytesIO

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from app.config import get_settings
from app.main import app, build_classifier


TOKEN = "token-internal-untuk-test"


@pytest.fixture(autouse=True)
def classifier(monkeypatch):
    # Lifespan tidak jalan via ASGITransport — pasang classifier manual.
    monkeypatch.setenv("CV_INTERNAL_TOKEN", TOKEN)
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
    assert resp.json() == {"status": "ok", "mode": "dummy", "model_loaded": False}


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
