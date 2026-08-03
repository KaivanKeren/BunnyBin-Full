import base64
import binascii
import logging
import time
from contextlib import asynccontextmanager
from io import BytesIO

import anyio
from fastapi import FastAPI, HTTPException
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
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


@app.post("/classify", response_model=ClassifyResponse)
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


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        mode=get_settings().cv_mode,
        model_loaded=app.state.classifier.model_loaded,
    )
