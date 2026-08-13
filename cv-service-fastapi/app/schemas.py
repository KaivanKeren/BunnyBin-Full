from typing import Literal

from pydantic import BaseModel, Field


class ClassifyRequest(BaseModel):
    image_base64: str = Field(min_length=1)


class ClassifyResponse(BaseModel):
    category: Literal["organic", "inorganic"] | None
    label: str | None = None
    confidence: float = Field(ge=0, le=1)
    bbox: tuple[float, float, float, float] | None
    model_version: str
    # Jawaban ini datang dari jalur cadangan, bukan model utama. Kiosk memakainya
    # untuk menampilkan penanda; operator memakainya untuk tahu kapan mode cloud
    # berhenti melayani tanpa harus membaca log server.
    degraded: bool = False
    degraded_reason: str | None = None


class HealthResponse(BaseModel):
    status: str
    mode: str
    model_loaded: bool
    # Hanya terisi di mode cloud (vlm/gemini). Ini permukaan yang membuat
    # "kuota habis tiga jam lalu" bisa dilihat dalam satu curl, alih-alih
    # disimpulkan dari akurasi yang tiba-tiba memburuk.
    vlm: dict | None = None
