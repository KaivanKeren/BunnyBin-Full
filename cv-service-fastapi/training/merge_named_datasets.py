"""Gabung 3 dataset Roboflow → 9 kelas objek bernama BunnyBin (dataset_combined/).

Sumber (semua sudah di-download sebagai YOLOv8):
  trafficlight_ds  — kulit pisang, jeruk, botol plastik, masker  (padat)
  mallail_ds       — daun, aqua gelas/botol, bungkus sachet, ampas tebu, kulit telur
  waste_vision_ds  — plastic bottle/cup/straw/container/bag/wrap, food, ...

Semua dipetakan ke 9 kelas selaras daftar item awal user + masker. Kelas yang tak
dipetakan (kaleng/kaca/kertas/kayu/dll) DIBUANG. Objek per-kelas DI-CAP agar
seimbang (kelas padat spt kulit_buah tidak mendominasi → akurasi kelas lain naik).

Pakai:  python merge_named_datasets.py            # tulis dataset_combined/
"""
from __future__ import annotations

import random
import shutil
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "dataset_combined"
CAP_PER_CLASS = 380          # maks objek/kelas di train (balancing)
SEED = 42

UNIFIED = [
    "kulit_buah",       # 0 organik
    "daun",             # 1 organik
    "sisa_makanan",     # 2 organik
    "botol_plastik",    # 3 anorganik
    "gelas_plastik",    # 4 anorganik
    "sedotan",          # 5 anorganik
    "wadah_plastik",    # 6 anorganik
    "bungkus_plastik",  # 7 anorganik
    "masker",           # 8 anorganik
]
NEW_ID = {n: i for i, n in enumerate(UNIFIED)}

# nama kelas sumber (persis dari data.yaml tiap dataset) -> nama kelas tujuan.
# Yang tak terdaftar = dibuang.
REMAP = {
    "trafficlight_ds": {
        "Organik-kulit-pisang": "kulit_buah",
        "Organik-jeruk-busuk": "kulit_buah",
        "Anorganik-botol-plastik": "botol_plastik",
        "Anorganik-masker": "masker",
    },
    "mallail_ds": {
        "Ampas tebu": "sisa_makanan",
        "kulit telur": "sisa_makanan",
        "daun": "daun",
        "aqua botol": "botol_plastik",
        "aqua gelas": "gelas_plastik",
        "bungkus kopi sachet": "bungkus_plastik",
        "plastik minyak goreng": "wadah_plastik",
        # "Ranting Kayu": dibuang
    },
    "waste_vision_ds": {
        "food": "sisa_makanan",
        "biodegradable": "sisa_makanan",
        "plastic bottle": "botol_plastik",
        "plastic jug": "botol_plastik",
        "plastic cup": "gelas_plastik",
        "paper cup": "gelas_plastik",
        "plastic straw": "sedotan",
        "paper straw": "sedotan",
        "plastic container": "wadah_plastik",
        "paper bowl": "wadah_plastik",
        "paper box": "wadah_plastik",
        "paper plate": "wadah_plastik",
        "paper carton": "wadah_plastik",
        "plastic bag": "bungkus_plastik",
        "plastic wrap": "bungkus_plastik",
        "plastic packaging": "bungkus_plastik",
        "paper packaging": "bungkus_plastik",
        "plastic": "bungkus_plastik",
        # can/metal/glass/cardboard/paper/napkin/wooden utensil: dibuang
    },
}


def src_names(ds: str) -> list[str]:
    """Baca urutan names dari data.yaml dataset (untuk map id sumber → nama)."""
    text = (HERE / ds / "data.yaml").read_text()
    names: list[str] = []
    in_names = False
    for line in text.splitlines():
        if line.startswith("names:"):
            in_names = True
            continue
        if in_names:
            s = line.strip()
            if s.startswith("- "):
                names.append(s[2:].strip())
            elif s and not s.startswith("#"):
                break
    return names


def collect(ds: str, split: str) -> list[tuple[Path, list[str]]]:
    """Kembalikan [(img_path, [baris_label_remapped]), ...] untuk satu split."""
    names = src_names(ds)
    id2new = {i: NEW_ID[REMAP[ds][n]] for i, n in enumerate(names) if n in REMAP[ds]}
    img_dir = HERE / ds / split / "images"
    lbl_dir = HERE / ds / split / "labels"
    out: list[tuple[Path, list[str]]] = []
    if not lbl_dir.is_dir():
        return out
    for lbl in lbl_dir.glob("*.txt"):
        lines = []
        for line in lbl.read_text().splitlines():
            p = line.split()
            if len(p) < 5:
                continue
            new = id2new.get(int(p[0]))
            if new is None:
                continue
            lines.append(" ".join([str(new), *p[1:]]))
        if not lines:
            continue  # buang gambar tanpa objek terpetakan
        cand = list(img_dir.glob(lbl.stem + ".*"))
        if cand:
            out.append((cand[0], lines))
    return out


def write_split(items: list[tuple[Path, list[str]]], split: str, cap: int | None) -> Counter:
    rng = random.Random(SEED)
    rng.shuffle(items)
    img_out = OUT / "images" / split
    lbl_out = OUT / "labels" / split
    img_out.mkdir(parents=True, exist_ok=True)
    lbl_out.mkdir(parents=True, exist_ok=True)
    counts: Counter = Counter()
    n = 0
    for i, (img, lines) in enumerate(items):
        cls_here = {int(l.split()[0]) for l in lines}
        # balancing: lewati gambar bila SEMUA kelasnya sudah penuh (cap)
        if cap and all(counts[c] >= cap for c in cls_here):
            continue
        dst = f"{img.stem}_{i}{img.suffix}"
        shutil.copyfile(img, img_out / dst)
        (lbl_out / f"{img.stem}_{i}.txt").write_text("\n".join(lines))
        for l in lines:
            counts[int(l.split()[0])] += 1
        n += 1
    print(f"  [{split}] {n} gambar")
    return counts


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    for split, cap in [("train", CAP_PER_CLASS), ("valid", None), ("test", None)]:
        items: list[tuple[Path, list[str]]] = []
        for ds in REMAP:
            items += collect(ds, split)
        out_split = "train" if split == "train" else "val"
        # gabung valid+test ke val
        counts = write_split(items, out_split, cap) if split != "test" else write_split(items, "val", None)
        if split in ("train",):
            print("  distribusi objek train per kelas:")
            for name in UNIFIED:
                print(f"    {name:16} {counts.get(NEW_ID[name], 0)}")
    print(f"\n  -> {OUT}")


if __name__ == "__main__":
    main()
