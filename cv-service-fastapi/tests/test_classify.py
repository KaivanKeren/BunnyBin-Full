import base64
import os
from io import BytesIO

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from app.config import get_settings
from app.main import app, build_classifier


@pytest.fixture(autouse=True)
def classifier():
    # Lifespan tidak jalan via ASGITransport — pasang classifier manual.
    get_settings.cache_clear()
    app.state.classifier = build_classifier(get_settings())
    yield
    get_settings.cache_clear()


@pytest.fixture
async def client():
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
