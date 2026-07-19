"""Siapkan dataset YOLO 2-kelas (organic/inorganic) BunnyBin dari dataset publik
`keremberke/garbage-object-detection` (Roboflow "garbage-classification-3").

Sumber: 6 kelas COCO [biodegradable, cardboard, glass, metal, paper, plastic].
Pemetaan ke tujuan project:
    biodegradable                          -> organic   (class 0)
    cardboard, glass, metal, paper, plastic -> inorganic (class 1)

Alur:
    1. Ekstrak {train,valid}.zip (unduh manual dari HF ke --raw bila belum ada).
    2. Baca _annotations.coco.json tiap split, tulis label YOLO (bbox ternormalisasi)
       dengan class id yang sudah di-remap ke 2 kelas.
    3. Susun ke struktur ultralytics: dataset/images/{train,val}, dataset/labels/{train,val}.

Pakai:
    # unduh dulu (sekali):
    #   BASE=https://huggingface.co/datasets/keremberke/garbage-object-detection/resolve/main/data
    #   curl -L $BASE/train.zip -o raw/train.zip ; curl -L $BASE/valid.zip -o raw/valid.zip
    python prepare_dataset.py --raw /path/ke/raw --out dataset [--max-per-split 1500]

Hasil: dataset/ siap dilatih dengan train.py (data.yaml sudah menunjuk ke sini).
"""

import argparse
import json
import shutil
import zipfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent

# Nama kelas sumber -> kategori tujuan. Tak terdaftar -> inorganic (aman: mayoritas
# sampah non-organik). Ubah di sini bila memakai dataset lain.
ORGANIC_SOURCE = {"biodegradable", "organic", "compost", "food"}
CLASS_ID = {"organic": 0, "inorganic": 1}  # WAJIB selaras names di data.yaml


def target_class(name: str) -> int:
    return CLASS_ID["organic"] if name.lower() in ORGANIC_SOURCE else CLASS_ID["inorganic"]


def extract(raw: Path, split_zip: str, dest: Path) -> Path:
    """Ekstrak <split>.zip ke dest/<split_stem> bila belum diekstrak."""
    stem = Path(split_zip).stem
    out = dest / stem
    if out.is_dir() and any(out.glob("*.jpg")):
        return out
    zpath = raw / split_zip
    if not zpath.is_file():
        raise FileNotFoundError(f"{zpath} tidak ada — unduh dulu dari HuggingFace (lihat docstring).")
    out.mkdir(parents=True, exist_ok=True)
    print(f"  ekstrak {split_zip} ...")
    with zipfile.ZipFile(zpath) as z:
        z.extractall(out)
    return out


def convert_split(src_dir: Path, out: Path, split_name: str, limit: int | None) -> Counter:
    """Baca COCO json di src_dir, tulis gambar+label YOLO ke out/{images,labels}/split_name."""
    coco = json.loads((src_dir / "_annotations.coco.json").read_text())
    cats = {c["id"]: c["name"] for c in coco["categories"]}
    anns_by_img: dict[int, list] = {}
    for a in coco["annotations"]:
        anns_by_img.setdefault(a["image_id"], []).append(a)

    img_out = out / "images" / split_name
    lbl_out = out / "labels" / split_name
    img_out.mkdir(parents=True, exist_ok=True)
    lbl_out.mkdir(parents=True, exist_ok=True)

    counts: Counter = Counter()
    images = coco["images"]
    if limit:
        images = images[:limit]

    for img in images:
        w, h = img["width"], img["height"]
        anns = anns_by_img.get(img["id"], [])
        if not anns:
            continue  # lewati gambar tanpa anotasi
        lines = []
        for a in anns:
            x, y, bw, bh = a["bbox"]  # COCO: x,y,w,h absolut (pojok kiri-atas)
            xc = (x + bw / 2) / w
            yc = (y + bh / 2) / h
            cls = target_class(cats[a["category_id"]])
            lines.append(f"{cls} {xc:.6f} {yc:.6f} {bw / w:.6f} {bh / h:.6f}")
            counts["organic" if cls == 0 else "inorganic"] += 1
        src_img = src_dir / img["file_name"]
        if not src_img.is_file():
            continue
        shutil.copyfile(src_img, img_out / img["file_name"])
        (lbl_out / (Path(img["file_name"]).stem + ".txt")).write_text("\n".join(lines))
    return counts


def main() -> None:
    ap = argparse.ArgumentParser(description="Siapkan dataset YOLO 2-kelas BunnyBin")
    ap.add_argument("--raw", default=str(HERE / "raw"), help="folder berisi train.zip / valid.zip")
    ap.add_argument("--out", default=str(HERE / "dataset"), help="folder output dataset YOLO")
    ap.add_argument("--max-train", type=int, default=None,
                    help="batasi jumlah gambar train (untuk latihan cepat di CPU)")
    ap.add_argument("--max-val", type=int, default=None,
                    help="batasi jumlah gambar val")
    args = ap.parse_args()

    raw = Path(args.raw)
    out = Path(args.out)
    tmp = out / "_extracted"

    limits = {"train": args.max_train, "val": args.max_val}
    total: Counter = Counter()
    for split_zip, yolo_split in [("train.zip", "train"), ("valid.zip", "val")]:
        print(f"[{yolo_split}]")
        src = extract(raw, split_zip, tmp)
        c = convert_split(src, out, yolo_split, limits[yolo_split])
        print(f"  objek: organic={c['organic']} inorganic={c['inorganic']}")
        total += c

    shutil.rmtree(tmp, ignore_errors=True)
    n_train = len(list((out / "images" / "train").glob("*.jpg")))
    n_val = len(list((out / "images" / "val").glob("*.jpg")))
    print(f"\n✅ Dataset siap di {out}")
    print(f"   gambar: train={n_train} val={n_val}")
    print(f"   objek total: organic={total['organic']} inorganic={total['inorganic']}")
    print("   Latih: python train.py --epochs 50")


if __name__ == "__main__":
    main()
