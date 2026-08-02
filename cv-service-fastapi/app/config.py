from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings

# ── LABEL MAPS (per model source) ──────────────────────────────────────────────
# Each map converts model-specific labels → API contract category
# ("organic"|"inorganic"). Labels NOT in any map → category None (safe default).

# Model kustom 2-kelas (produksi) — identity mapping
LABEL_MAP_CUSTOM: dict[str, str] = {
    "organic": "organic",
    "inorganic": "inorganic",
}

# Demo COCO (yolov8n pretrained, 80 kelas)
LABEL_MAP_COCO: dict[str, str] = {
    # Makanan/organik
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
    # Wadah/perkakas/anorganik
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

# Dataset Kaggle garbage-classification-v2 (10 kelas, model yolov8-cls)
LABEL_MAP_KAGGLE10: dict[str, str] = {
    "biological": "organic",
    "battery": "inorganic",
    "cardboard": "inorganic",
    "clothes": "inorganic",
    "glass": "inorganic",
    "metal": "inorganic",
    "paper": "inorganic",
    "plastic": "inorganic",
    "shoes": "inorganic",
    "trash": "inorganic",
}

# Roboflow organic/inorganic model (cloud API).
# Model `deteksi-sampah-organik-anorganik/3` punya 3 kelas: "Sampah Organik",
# "Sampah Anorganik", dan varian ber-tanda-hubung "Sampah-Anorganik" (label lama
# dataset). Ketiganya WAJIB terpetakan — bila tidak, kelas yang tak terpetakan
# menghasilkan category=None (objek dianggap tak terdeteksi).
LABEL_MAP_ROBOFLOW: dict[str, str] = {
    "organic": "organic",
    "Sampah Organik": "organic",
    "inorganic": "inorganic",
    "Sampah Anorganik": "inorganic",
    "Sampah-Anorganik": "inorganic",
}

# Model deteksi objek BERNAMA (10 kelas) — hasil training kustom BunnyBin
# (lihat training/data_named.yaml). Model mengeluarkan nama objek spesifik;
# peta ini yang menjaga sorting tetap AKURAT (nama objek → kategori bin).
# Kunci WAJIB selaras dengan `names` di training/data_named.yaml.
LABEL_MAP_NAMED: dict[str, str] = {
    # organik
    "sisa_makanan": "organic",
    "kayu": "organic",
    "kulit_buah": "organic",   # kelas tambahan (data sendiri) — sudah dipetakan
    "daun": "organic",
    "daun_hijau": "organic",
    "daun_kering": "organic",
    "rumput": "organic",
    # anorganik
    "botol_plastik": "inorganic",
    "gelas_plastik": "inorganic",
    "sedotan": "inorganic",
    "sedotan_plastik": "inorganic",
    "wadah_plastik": "inorganic",
    "bungkus_plastik": "inorganic",
    "bungkus_snack": "inorganic",
    "masker": "inorganic",
    "kertas": "inorganic",
    "kaleng": "inorganic",
    "kaca": "inorganic",
}

# Nama tampilan ramah (untuk UI kiosk). Label mentah snake_case tetap dikirim di
# `label`; frontend mempercantik sendiri (prettyLabel), jadi map ini dokumentasi.
DISPLAY_NAMES: dict[str, str] = {
    "sisa_makanan": "Sisa Makanan",
    "kayu": "Kayu",
    "kulit_buah": "Kulit Buah",
    "daun": "Daun",
    "masker": "Masker",
    "daun_hijau": "Daun Hijau",
    "daun_kering": "Daun Kering",
    "rumput": "Rumput",
    "botol_plastik": "Botol Plastik",
    "gelas_plastik": "Gelas Plastik",
    "sedotan": "Sedotan",
    "sedotan_plastik": "Sedotan Plastik",
    "wadah_plastik": "Wadah Plastik",
    "bungkus_plastik": "Bungkus Plastik",
    "bungkus_snack": "Bungkus Snack",
    "kertas": "Kertas",
    "kaleng": "Kaleng",
    "kaca": "Kaca",
}

# Aggregate: all maps combined (used by YOLO classifier which may load any model)
LABEL_MAP: dict[str, str] = {
    **LABEL_MAP_CUSTOM,
    **LABEL_MAP_COCO,
    **LABEL_MAP_KAGGLE10,
    **LABEL_MAP_ROBOFLOW,
    **LABEL_MAP_NAMED,
}


def resolve_category(label: str | None) -> str | None:
    """Petakan label model apa pun → "organic"|"inorganic"|None.

    Strategi dua lapis supaya tahan variasi penamaan (spasi/tanda-hubung/kapital)
    dan model baru tanpa perlu update peta manual:
      1. Cocokkan persis ke LABEL_MAP (cepat, meliputi label spesifik COCO/Kaggle).
      2. Fallback kata-kunci Indonesia/Inggris. "anorganik"/"inorganic" DICEK
         LEBIH DULU karena string-nya memuat substring "organik"/"organic".
    Label tak dikenal → None (default aman: objek dianggap tak terdeteksi).
    """
    if not label:
        return None
    if label in LABEL_MAP:
        return LABEL_MAP[label]
    low = label.strip().lower()
    if "anorganik" in low or "inorganic" in low or "non-organic" in low:
        return "inorganic"
    if "organik" in low or "organic" in low:
        return "organic"
    return None


class Settings(BaseSettings):
    cv_mode: Literal["dummy", "real", "roboflow"] = "dummy"
    cv_confidence_threshold: float = 0.6
    cv_max_image_mb: int = 5
    cv_model_path: str = "/model/best.pt"
    # Roboflow Cloud API (hosted inference)
    roboflow_api_url: str = "https://detect.roboflow.com"
    roboflow_model_id: str = ""
    roboflow_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
