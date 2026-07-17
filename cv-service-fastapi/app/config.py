from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings

# Mapping label model (real mode) -> kategori kontrak API ("organic"|"inorganic").
# Label yang TIDAK ada di map -> category None ("tidak yakin"), sesuai perilaku aman.
#
# Dua skenario didukung sekaligus oleh satu map:
#   1. Model kustom 2-kelas (produksi) — kelas bernama persis "organic"/"inorganic"
#      (identity mapping di bawah). Lihat training/README.md.
#   2. Model demo COCO (yolov8n pretrained, 80 kelas) — untuk uji coba SEBELUM
#      model kustom siap. Kelas makanan -> organik, wadah/perkakas -> anorganik.
#      Kelas COCO lain (person, car, dst.) tidak dipetakan -> None.
LABEL_MAP: dict[str, str] = {
    # --- Model kustom produksi (identity) ---
    "organic": "organic",
    "inorganic": "inorganic",
    # --- Demo COCO: makanan/organik ---
    "banana": "organic",
    "apple": "organic",
    "orange": "organic",
    "broccoli": "organic",
    "carrot": "organic",
    "sandwich": "organic",
    "hot dog": "organic",
    "pizza": "organic",
    "donut": "organic",
    "cake": "organic",
    # --- Demo COCO: wadah/perkakas/anorganik ---
    "bottle": "inorganic",
    "wine glass": "inorganic",
    "cup": "inorganic",
    "fork": "inorganic",
    "knife": "inorganic",
    "spoon": "inorganic",
    "bowl": "inorganic",
    "cell phone": "inorganic",
    "scissors": "inorganic",
    "toothbrush": "inorganic",
    "book": "inorganic",
}


class Settings(BaseSettings):
    cv_mode: Literal["dummy", "real"] = "dummy"
    cv_confidence_threshold: float = 0.6
    cv_max_image_mb: int = 5
    cv_model_path: str = "/model/best.pt"


@lru_cache
def get_settings() -> Settings:
    return Settings()
