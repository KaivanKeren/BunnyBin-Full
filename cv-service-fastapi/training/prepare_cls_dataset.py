"""Bangun split train/val format YOLO-classification dari dataset Kaggle
garbage-classification-v2 (sumn2u).

Sumber: folder berisi subfolder per-kelas (mis. standardized_256/battery/*.jpg).
Output (symlink, hemat disk):
    dataset_cls/
      train/<kelas>/*.jpg
      val/<kelas>/*.jpg

Pakai:
    python prepare_cls_dataset.py --src /path/ke/standardized_256 \\
        --out dataset_cls --val-frac 0.2 [--per-class N]
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="folder berisi subfolder per-kelas")
    ap.add_argument("--out", default="dataset_cls", help="folder output split")
    ap.add_argument("--val-frac", type=float, default=0.2)
    ap.add_argument("--per-class", type=int, default=0,
                    help="batasi N gambar per kelas (0=semua) untuk latih cepat")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    src = Path(args.src).expanduser().resolve()
    out = Path(args.out).resolve()
    rng = random.Random(args.seed)

    classes = sorted(p.name for p in src.iterdir() if p.is_dir())
    if not classes:
        raise SystemExit(f"tak ada subfolder kelas di {src}")

    print(f"sumber: {src}")
    print(f"kelas ({len(classes)}): {', '.join(classes)}")
    n_train = n_val = 0
    for cls in classes:
        imgs = [p for p in (src / cls).iterdir() if p.suffix.lower() in IMG_EXT]
        rng.shuffle(imgs)
        if args.per_class:
            imgs = imgs[: args.per_class]
        n_val_cls = max(1, int(len(imgs) * args.val_frac))
        val, train = imgs[:n_val_cls], imgs[n_val_cls:]
        for split, group in (("train", train), ("val", val)):
            dst_dir = out / split / cls
            dst_dir.mkdir(parents=True, exist_ok=True)
            for img in group:
                link = dst_dir / img.name
                if not link.exists():
                    link.symlink_to(img)
        n_train += len(train)
        n_val += len(val)
        print(f"  {cls:12} train={len(train):5}  val={len(val):4}")

    print(f"\ntotal: train={n_train}  val={n_val}")
    print(f"output: {out}")


if __name__ == "__main__":
    main()
