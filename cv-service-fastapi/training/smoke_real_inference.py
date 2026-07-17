"""Smoke-test real mode TANPA hardware: jalankan inference YOLO nyata terhadap
gambar objek dan cetak kategori + confidence + bbox.

Pakai model demo (atau model kustom) via env CV_MODEL_PATH.

    pip install -r ../requirements.txt -r ../requirements-real.txt
    python make_demo_model.py                       # sekali, untuk model demo
    CV_MODE=real CV_MODEL_PATH=../models/best-demo.pt python smoke_real_inference.py IMG [IMG...]

Bila tanpa argumen gambar, memakai sample bawaan ultralytics (bus.jpg) sebagai
uji pipa — objek COCO yang tak dipetakan akan menghasilkan category None (wajar).
Untuk uji kategori nyata, beri foto pisang/botol/cangkir sebagai argumen.
"""

import os
import sys
from pathlib import Path

os.environ.setdefault("CV_MODE", "real")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))  # agar `import app` jalan dari folder training/


def sample_images(args: list[str]) -> list[Path]:
    if args:
        return [Path(a) for a in args]
    try:
        import ultralytics

        asset = Path(ultralytics.__file__).parent / "assets" / "bus.jpg"
        if asset.is_file():
            print(f"(tanpa argumen — pakai sample bawaan: {asset.name})")
            return [asset]
    except Exception:
        pass
    print("Beri path gambar sebagai argumen. Contoh: python smoke_real_inference.py banana.jpg")
    return []


def main() -> None:
    from app.config import get_settings
    from app.main import build_classifier

    settings = get_settings()
    if settings.cv_mode != "real":
        sys.exit("Set CV_MODE=real dulu.")

    print(f"CV_MODE={settings.cv_mode}  model={settings.cv_model_path}  "
          f"threshold={settings.cv_confidence_threshold}")
    classifier = build_classifier(settings)  # memuat weight; error bila tak ada
    print(f"model_loaded={classifier.model_loaded}\n")

    from PIL import Image

    images = sample_images(sys.argv[1:])
    if not images:
        sys.exit(1)

    for img_path in images:
        if not img_path.is_file():
            print(f"  ⚠️  {img_path} tidak ditemukan"); continue
        det = classifier.classify(Image.open(img_path).convert("RGB"))
        cat = det.category if det.confidence >= settings.cv_confidence_threshold else None
        print(f"  {img_path.name:>20}  ->  category={cat}  "
              f"conf={det.confidence:.2f}  bbox={det.bbox}  (raw label kategori={det.category})")


if __name__ == "__main__":
    main()
