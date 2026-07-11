import base64
import binascii
from contextlib import asynccontextmanager
from io import BytesIO

import anyio
from fastapi import FastAPI, HTTPException
from PIL import Image, UnidentifiedImageError

from app.config import Settings, get_settings
from app.inference.base import Classifier
from app.inference.dummy import DummyClassifier
from app.schemas import ClassifyRequest, ClassifyResponse, HealthResponse


def build_classifier(settings: Settings) -> Classifier:
    if settings.cv_mode == "real":
        from app.inference.yolo import YoloClassifier

        return YoloClassifier(settings.cv_model_path)

    return DummyClassifier()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.classifier = build_classifier(get_settings())
    yield


app = FastAPI(title="BunnyBin CV Service", lifespan=lifespan)


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
    image = decode_and_validate(req.image_base64, settings)

    # Inference bisa berat (real mode) — jangan blokir event loop.
    detection = await anyio.to_thread.run_sync(app.state.classifier.classify, image)

    below_threshold = detection.confidence < settings.cv_confidence_threshold

    return ClassifyResponse(
        category=None if below_threshold else detection.category,
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
