"""Siapkan model DEMO agar CV_MODE=real bisa langsung diuji SEBELUM model
kustom dilatih.

Model demo = bobot pretrained COCO (yolov8n, 80 kelas umum). Kelas COCO
dipetakan ke organik/anorganik lewat LABEL_MAP di app/config.py — jadi begitu
webcam menangkap objek nyata (pisang, botol, cangkir, dst.), real mode langsung
mengembalikan kategori + bounding box.

⚠️  Ini BUKAN akurasi produksi. COCO hanya mengenal 80 objek umum dan tidak
    dilatih khusus untuk sampah. Ganti dengan model kustom (train.py) untuk produksi.

Pakai:
    pip install -r ../requirements.txt -r ../requirements-real.txt
    python make_demo_model.py

Hasil: models/best-demo.pt  (siap dipakai via CV_MODEL_PATH)
"""

import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODELS_DIR = HERE.parent / "models"
OUT = MODELS_DIR / "best-demo.pt"


def main() -> None:
    MODELS_DIR.mkdir(exist_ok=True)

    from ultralytics import YOLO

    # Memicu unduh bobot pretrained COCO (yolov8n.pt) bila belum ada.
    print("Mengunduh / memuat bobot pretrained COCO (yolov8n)...")
    model = YOLO("yolov8n.pt")

    # ckpt_path = lokasi file .pt yang barusan diunduh ultralytics.
    src = Path(model.ckpt_path) if getattr(model, "ckpt_path", None) else Path("yolov8n.pt")
    if not src.is_file():
        raise FileNotFoundError(f"Bobot pretrained tidak ditemukan di {src}")

    shutil.copyfile(src, OUT)
    print(f"\n✅ Model demo siap: {OUT}")
    print("   Uji real mode:")
    print(f"     CV_MODE=real CV_MODEL_PATH={OUT} uvicorn app.main:app --port 8801")
    print("   Lalu POST /classify dengan foto objek nyata (pisang -> organic, botol -> inorganic).")


if __name__ == "__main__":
    main()
