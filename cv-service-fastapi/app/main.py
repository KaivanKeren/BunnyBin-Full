import base64
import binascii
import logging
import secrets
import time
from contextlib import asynccontextmanager
from io import BytesIO

import anyio
from fastapi import Depends, FastAPI, Header, HTTPException
from PIL import Image, UnidentifiedImageError

from app.config import Settings, get_settings
from app.inference.base import Classifier
from app.inference.dummy import DummyClassifier
from app.schemas import ClassifyRequest, ClassifyResponse, HealthResponse

log = logging.getLogger("cv")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def build_classifier(settings: Settings) -> Classifier:
    if settings.cv_mode == "real":
        from app.inference.yolo import YoloClassifier

        return YoloClassifier(settings.cv_model_path)

    if settings.cv_mode == "roboflow":
        from app.inference.roboflow import RoboflowClassifier

        if not settings.roboflow_model_id:
            raise RuntimeError("CV_MODE=roboflow membutuhkan ROBOFLOW_MODEL_ID")
        if not settings.roboflow_api_key:
            raise RuntimeError("CV_MODE=roboflow membutuhkan ROBOFLOW_API_KEY")
        return RoboflowClassifier(
            api_url=settings.roboflow_api_url,
            model_id=settings.roboflow_model_id,
            api_key=settings.roboflow_api_key,
        )

    return DummyClassifier()


def require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    """Layanan ini hanya boleh dipanggil Laravel, bukan dunia luar.

    Sebelumnya perlindungannya murni topologi: compose dev mem-bind ke
    127.0.0.1 dan compose produksi berjanji memakai `expose` internal-only. Itu
    benar, tapi seluruhnya bergantung pada konfigurasi jaringan yang belum ada —
    satu kesalahan port di kemudian hari langsung membuka layanan inferensi ke
    internet, dengan biaya CPU/GPU ditanggung sendiri.

    Perbandingan konstan-waktu dipakai supaya panjang/isi token tidak bisa
    disimpulkan dari selisih waktu balasan.
    """
    expected = get_settings().cv_internal_token

    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="X-Internal-Token tidak valid")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # Fail fast, pola yang sama dengan YoloClassifier saat weight tidak ada:
    # lebih baik menolak start daripada berjalan diam-diam tanpa autentikasi.
    # Token kosong = endpoint /classify terbuka untuk siapa pun yang bisa
    # menjangkau portnya, dan itu justru kondisi yang ingin dihilangkan.
    if not settings.cv_internal_token:
        raise RuntimeError(
            "CV_INTERNAL_TOKEN wajib diisi — layanan menolak berjalan tanpa "
            "autentikasi. Generate dengan: python -c "
            "\"import secrets; print(secrets.token_urlsafe(32))\""
        )

    log.info("Starting CV service: mode=%s, model=%s", settings.cv_mode, settings.cv_model_path)
    app.state.classifier = build_classifier(settings)
    log.info("Classifier ready: %s", type(app.state.classifier).__name__)
    yield


app = FastAPI(title="Binexa CV Service", lifespan=lifespan)


def decode_and_validate(image_base64: str, settings: Settings) -> Image.Image:
    try:
        raw = base64.b64decode(image_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="image_base64 bukan base64 valid")

    if len(raw) > settings.cv_max_image_mb * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"Gambar melebihi {settings.cv_max_image_mb} MB",
        )

    try:
        image = Image.open(BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(status_code=422, detail="Payload bukan gambar valid")

    return image.convert("RGB")


@app.post("/classify", response_model=ClassifyResponse, dependencies=[Depends(require_internal_token)])
async def classify(req: ClassifyRequest) -> ClassifyResponse:
    settings = get_settings()
    t0 = time.monotonic()
    image = decode_and_validate(req.image_base64, settings)
    log.info(
        "classify: image %dx%d, mode=%s, model=%s",
        image.width, image.height, settings.cv_mode, settings.cv_model_path,
    )

    # Inference bisa berat (real mode) — jangan blokir event loop.
    detection = await anyio.to_thread.run_sync(app.state.classifier.classify, image)
    elapsed_ms = (time.monotonic() - t0) * 1000

    below_threshold = detection.confidence < settings.cv_confidence_threshold
    log.info(
        "classify: label=%s cat=%s conf=%.3f bbox=%s below_thr=%s (%.0fms)",
        detection.label, detection.category, detection.confidence,
        detection.bbox, below_threshold, elapsed_ms,
    )

    return ClassifyResponse(
        category=None if below_threshold else detection.category,
        label=detection.label,
        confidence=detection.confidence,
        bbox=detection.bbox,
        model_version=detection.model_version,
    )


# SENGAJA tanpa autentikasi: HEALTHCHECK di Dockerfile memanggilnya tanpa
# kredensial, dan balasannya tidak memuat apa pun yang sensitif — hanya status,
# mode, dan apakah model termuat.
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        mode=get_settings().cv_mode,
        model_loaded=app.state.classifier.model_loaded,
    )
