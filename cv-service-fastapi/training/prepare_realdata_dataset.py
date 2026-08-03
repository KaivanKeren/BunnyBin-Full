"""Siapkan dataset foto asli prototipe Binexa untuk fine-tuning.

Menerima folder berisi foto asli per kelas (organic/inorganic),
split train/val, dan output ke format kompatibel train_cls.py.

Struktur input (folder per kelas):
    foto_prototipe/
      organic/
        img001.jpg
        img002.jpg
      inorganic/
        img003.jpg
        img004.jpg

Output (symlink):
    dataset_realdata/
      train/organic/*.jpg
      train/inorganic/*.jpg
      val/organic/*.jpg
      val/inorganic/*.jpg

Pakai:
    python prepare_realdata_dataset.py --src /path/foto_prototipe \\
        --out dataset_realdata --val-frac 0.2
"""

from __future__ import annotations

import argparse
import random
from pathlib import Path

IMG_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def main() -> None:
    ap = argparse.ArgumentParser(description="Siapkan dataset foto asli untuk fine-tuning")
    ap.add_argument("--src", required=True, help="folder berisi subfolder per kelas (organic/inorganic)")
    ap.add_argument("--out", default="dataset_realdata", help="folder output split")
    ap.add_argument("--val-frac", type=float, default=0.2)
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
        if not imgs:
            print(f"  ⚠️  {cls}: tidak ada gambar, skip")
            continue

        rng.shuffle(imgs)
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
    print(f"\nSelanjutnya, jalankan fine-tuning:")
    print(f"  python train_cls.py --data {out} --pretrained-checkpoint <path-to-checkpoint>")


if __name__ == "__main__":
    main()
