"""Latih model YOLO-classification untuk BunnyBin dari dataset garbage-classification-v2.

Prasyarat: jalankan prepare_cls_dataset.py dulu untuk membuat folder split
`dataset_cls/{train,val}/<kelas>/`.

Pakai:
    ../.venv-real/bin/python train_cls.py                 # default: yolov8n-cls, 20 epoch, imgsz 224
    ../.venv-real/bin/python train_cls.py --epochs 5 --imgsz 160   # latih cepat

Hasil bobot terbaik disalin ke ../models/best-garbage-cls.pt agar dipakai
realtime_detect.py / service (CV_MODEL_PATH).
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE / "dataset_cls"))
    ap.add_argument("--model", default="yolov8n-cls.pt", help="bobot awal (pretrained)")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--imgsz", type=int, default=224)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--name", default="garbage-cls")
    args = ap.parse_args()

    data = Path(args.data)
    if not (data / "train").is_dir():
        raise SystemExit(f"dataset belum siap: {data}/train tidak ada. Jalankan prepare_cls_dataset.py dulu.")

    from ultralytics import YOLO

    model = YOLO(args.model)
    results = model.train(
        data=str(data),
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        project=str(HERE / "runs"),
        name=args.name,
        exist_ok=True,
        patience=8,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    dst = HERE.parent / "models" / "best-garbage-cls.pt"
    if best.is_file():
        shutil.copy(best, dst)
        print(f"\n✓ bobot terbaik -> {dst}")
    else:
        print(f"⚠️  best.pt tidak ditemukan di {best}")


if __name__ == "__main__":
    main()
