"""Latih model YOLO kustom 2-kelas (organic/inorganic) untuk BunnyBin.

Prasyarat:
    pip install -r ../requirements.txt -r ../requirements-real.txt
    Dataset sudah tersedia di training/dataset/ (lihat data.yaml).

Contoh:
    python train.py                          # default: yolov8n, 100 epoch, 640px
    python train.py --epochs 200 --model yolov8s.pt --imgsz 640
    python train.py --device 0               # pakai GPU index 0 (default: cpu bila tak ada GPU)

Hasil terbaik: runs/detect/train*/weights/best.pt
Salin ke lokasi CV_MODEL_PATH (mis. cv-service-fastapi/models/best.pt), lalu:
    CV_MODE=real CV_MODEL_PATH=models/best.pt uvicorn app.main:app
"""

import argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Latih model YOLO BunnyBin")
    parser.add_argument("--model", default="yolov8n.pt", help="base weight (transfer learning)")
    parser.add_argument("--data", default=str(HERE / "data.yaml"))
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default=None, help="cuda index (mis. 0) atau 'cpu'")
    parser.add_argument("--name", default="bunnybin", help="nama run")
    args = parser.parse_args()

    from ultralytics import YOLO

    model = YOLO(args.model)  # base pretrained (auto-download saat pertama)
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        name=args.name,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    print(f"\n✅ Selesai. Weight terbaik: {best}")
    print("   Deploy: salin ke models/best.pt lalu set CV_MODE=real, CV_MODEL_PATH=models/best.pt")


if __name__ == "__main__":
    main()
