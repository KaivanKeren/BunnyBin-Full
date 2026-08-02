"""Remap dataset waste-vision (28 kelas) → 10 kelas objek bernama BunnyBin.

waste-vision punya 28 kelas berserakan (banyak varian paper_*/plastic_*) dgn total
hanya ~740 gambar train → tiap kelas tipis, akurasi jelek. Script ini menggabungkan
ke 10 kelas objek yang lebih padat & bernama Indonesia, selaras dgn LABEL_MAP_NAMED
di app/config.py dan data_named.yaml.

Pakai:
    python remap_wastevision.py            # baca waste_vision_ds/ -> tulis dataset_named/
"""

from __future__ import annotations

import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE / "waste_vision_ds"
OUT = HERE / "dataset_named"

# id kelas TUJUAN (WAJIB selaras names di data_named.yaml & LABEL_MAP_NAMED)
NEW_CLASSES = [
    "sisa_makanan",    # 0 organik
    "kayu",            # 1 organik
    "botol_plastik",   # 2 anorganik
    "gelas_plastik",   # 3 anorganik
    "sedotan",         # 4 anorganik
    "wadah_plastik",   # 5 anorganik
    "bungkus_plastik", # 6 anorganik
    "kertas",          # 7 anorganik
    "kaleng",          # 8 anorganik
    "kaca",            # 9 anorganik
]
NEW_ID = {n: i for i, n in enumerate(NEW_CLASSES)}

# waste-vision id (urutan names di data.yaml aslinya) -> nama kelas tujuan
SRC_NAMES = [
    "biodegradable", "can", "cardboard", "food", "glass", "glass bottle", "liquid",
    "metal", "napkin", "paper", "paper bag", "paper bowl", "paper box", "paper carton",
    "paper cup", "paper packaging", "paper plate", "paper straw", "plastic", "plastic bag",
    "plastic bottle", "plastic container", "plastic cup", "plastic jug", "plastic packaging",
    "plastic straw", "plastic wrap", "wooden utensil",
]
REMAP = {
    "biodegradable": "sisa_makanan", "food": "sisa_makanan", "liquid": "sisa_makanan",
    "wooden utensil": "kayu",
    "plastic bottle": "botol_plastik", "plastic jug": "botol_plastik",
    "paper cup": "gelas_plastik", "plastic cup": "gelas_plastik",
    "paper straw": "sedotan", "plastic straw": "sedotan",
    "paper bowl": "wadah_plastik", "paper box": "wadah_plastik", "paper carton": "wadah_plastik",
    "paper plate": "wadah_plastik", "plastic container": "wadah_plastik",
    "paper packaging": "bungkus_plastik", "plastic": "bungkus_plastik", "plastic bag": "bungkus_plastik",
    "plastic packaging": "bungkus_plastik", "plastic wrap": "bungkus_plastik",
    "cardboard": "kertas", "napkin": "kertas", "paper": "kertas", "paper bag": "kertas",
    "can": "kaleng", "metal": "kaleng",
    "glass": "kaca", "glass bottle": "kaca",
}
# src_id -> new_id
SRC_TO_NEW = {i: NEW_ID[REMAP[name]] for i, name in enumerate(SRC_NAMES)}


def convert_split(src_split: str, out_split: str) -> tuple[int, int]:
    img_dir = SRC / src_split / "images"
    lbl_dir = SRC / src_split / "labels"
    if not img_dir.is_dir():
        return (0, 0)
    out_img = OUT / "images" / out_split
    out_lbl = OUT / "labels" / out_split
    out_img.mkdir(parents=True, exist_ok=True)
    out_lbl.mkdir(parents=True, exist_ok=True)

    n_img = n_obj = 0
    for lbl in lbl_dir.glob("*.txt"):
        lines_out = []
        for line in lbl.read_text().splitlines():
            parts = line.split()
            if len(parts) < 5:
                continue
            new_id = SRC_TO_NEW.get(int(parts[0]))
            if new_id is None:
                continue
            lines_out.append(" ".join([str(new_id), *parts[1:]]))
            n_obj += 1
        img = img_dir / (lbl.stem + ".jpg")
        if not img.is_file():
            cand = list(img_dir.glob(lbl.stem + ".*"))
            img = cand[0] if cand else None
        if img is None:
            continue
        shutil.copyfile(img, out_img / img.name)
        (out_lbl / (lbl.stem + ".txt")).write_text("\n".join(lines_out))
        n_img += 1
    return (n_img, n_obj)


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    total_img = total_obj = 0
    for src_split, out_split in [("train", "train"), ("valid", "val"), ("test", "val")]:
        ni, no = convert_split(src_split, out_split)
        print(f"  {src_split:6} -> {out_split:5}: {ni} gambar, {no} objek")
        total_img += ni
        total_obj += no
    # distribusi kelas
    from collections import Counter
    c: Counter = Counter()
    for txt in (OUT / "labels").rglob("*.txt"):
        for line in txt.read_text().splitlines():
            if line.split():
                c[NEW_CLASSES[int(line.split()[0])]] += 1
    print(f"\n  total: {total_img} gambar, {total_obj} objek")
    print("  distribusi objek per kelas:")
    for name in NEW_CLASSES:
        print(f"    {name:16} {c.get(name, 0)}")
    print(f"\n  -> {OUT}")


if __name__ == "__main__":
    main()
