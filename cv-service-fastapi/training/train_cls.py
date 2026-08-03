"""Latih model YOLO-classification untuk Binexa dari dataset garbage-classification-v2.

Prasyarat: jalankan prepare_cls_dataset.py dulu untuk membuat folder split
`dataset_cls/{train,val}/<kelas>/`.

Pakai:
    ../.venv-real/bin/python train_cls.py                 # default: yolov8n-cls, 20 epoch, imgsz 224
    ../.venv-real/bin/python train_cls.py --epochs 5 --imgsz 160   # latih cepat
    ../.venv-real/bin/python train_cls.py --pretrained-checkpoint runs/garbage-cls/weights/last.pt  # resume
    ../.venv-real/bin/python train_cls.py --pretrained-checkpoint models/best-garbage-cls.pt --data dataset_realdata  # fine-tuning

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
    ap.add_argument("--pretrained-checkpoint", default=None,
                    help="path ke checkpoint untuk resume/fine-tuning (mis. last.pt atau best.pt)")
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--imgsz", type=int, default=224)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--name", default="garbage-cls")
    args = ap.parse_args()

    data = Path(args.data)
    if not (data / "train").is_dir():
        raise SystemExit(f"dataset belum siap: {data}/train tidak ada. Jalankan prepare_cls_dataset.py dulu.")

    # Auto-resume: if --pretrained-checkpoint given and exists, use resume mode
    resume = False
    model_source = args.model
    if args.pretrained_checkpoint:
        ckpt = Path(args.pretrained_checkpoint)
        if ckpt.is_file():
            model_source = str(ckpt)
            # Check if last.pt exists in the default run dir for auto-resume
            last_ckpt = HERE / "runs" / args.name / "weights" / "last.pt"
            if last_ckpt.is_file() and not args.pretrained_checkpoint:
                model_source = str(last_ckpt)
                resume = True
                print(f"Auto-resume dari {last_ckpt}")
        else:
            print(f"⚠️  Checkpoint {ckpt} tidak ditemukan, mulai dari {args.model}")

    from ultralytics import YOLO

    model = YOLO(model_source)
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
        resume=resume,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    dst = HERE.parent / "models" / "best-garbage-cls.pt"
    if best.is_file():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(best, dst)
        print(f"\n✓ bobot terbaik -> {dst}")
    else:
        print(f"⚠️  best.pt tidak ditemukan di {best}")


if __name__ == "__main__":
    main()
