from typing import Literal

from pydantic import BaseModel, Field


class ClassifyRequest(BaseModel):
    image_base64: str = Field(min_length=1)


class ClassifyResponse(BaseModel):
    category: Literal["organic", "inorganic"] | None
    confidence: float = Field(ge=0, le=1)
    bbox: tuple[int, int, int, int] | None
    model_version: str


class HealthResponse(BaseModel):
    status: str
    mode: str
    model_loaded: bool
