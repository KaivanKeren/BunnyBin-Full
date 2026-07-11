from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings

# Mapping label model (real mode) -> kategori kontrak API.
# Model spesifik diputuskan di PRD-Software-CV.md; sesuaikan saat weight siap.
LABEL_MAP: dict[str, str] = {
    "organic": "organic",
    "inorganic": "inorganic",
}


class Settings(BaseSettings):
    cv_mode: Literal["dummy", "real"] = "dummy"
    cv_confidence_threshold: float = 0.6
    cv_max_image_mb: int = 5
    cv_model_path: str = "/model/best.pt"


@lru_cache
def get_settings() -> Settings:
    return Settings()
