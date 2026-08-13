#!/usr/bin/env python3
"""Ukur akurasi model pada foto LAPANGAN — bukan pada split dataset publik.

KENAPA SKRIP INI ADA
--------------------
`runs/bunnybin-combined` melaporkan mAP50 = 0,82. Angka itu benar, dan sekaligus
tidak menjawab pertanyaan yang penting. Val split-nya diambil dari kumpulan foto
publik yang sama dengan train split-nya, jadi yang diukur adalah "bisakah model
mengenali foto dari fotografer yang sama" — bukan "bisakah ia mengenali botol di
tangan anak SD di bawah lampu neon kelas".

Itu sebabnya metrik terlihat bagus sementara hasil lapangan terasa buruk, dan
keduanya benar sekaligus. Tidak ada yang perlu didamaikan; metriknya memang tidak
pernah mengukur hal yang dipedulikan.

Selama tidak ada angka lapangan, setiap perbaikan model adalah tebakan yang tak
bisa dibantah maupun dibuktikan. Skrip ini memberi angka itu.

ALUR PAKAI
----------
1. Kumpulkan frame. Nyalakan perekaman di layanan, lalu pakai kiosk seperti biasa:

       CV_CAPTURE_DIR=training/field_eval uvicorn app.main:app

   Target 100-200 frame sudah cukup untuk sinyal yang bisa dipercaya. Ambil dari
   ruangan, jarak, dan pencahayaan yang SAMA dengan pemakaian sungguhan — kalau
   diambil di meja kerja yang terang, hasilnya akan sama menyesatkannya dengan
   dataset publik.

2. Labeli. Tiap frame punya sidecar .json berisi tebakan model; isi dua field
   yang masih null:

       "truth_label": "botol_plastik",   <- nama objek, atau null bila tak ada sampah
       "truth_category": "inorganic"     <- "organic" | "inorganic" | null

   Sebagian besar tebakan model sudah benar, jadi ini kerja membenarkan, bukan
   mengetik dari nol. Frame tanpa sampah (tangan kosong, meja) WAJIB ikut
   dilabeli null — justru itu kasus yang paling sering salah, dan kalau
   dikeluarkan dari set, kelemahan terbesar model jadi tak terukur.

3. Ukur:

       python training/eval_field.py training/field_eval
       python training/eval_field.py training/field_eval --rerun   # panggil ulang model

   Tanpa --rerun, yang dinilai adalah prediksi yang TERSIMPAN (cepat, gratis,
   dan mencerminkan persis apa yang dilihat anak). Dengan --rerun, tiap gambar
   diklasifikasi ulang memakai CV_MODE saat ini — itu cara membandingkan model
   baru terhadap set yang sama.

YANG DILAPORKAN
---------------
Akurasi KATEGORI dipisah dari akurasi NAMA OBJEK, karena keduanya gagal dengan
cara berbeda dan hanya satu yang menentukan sampahnya masuk tong yang benar.
Dilaporkan juga perilaku pada frame kosong — angka yang paling sering terlupakan
dan yang paling banyak merusak pengalaman di kiosk.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

# Jalankan dari mana saja: skrip ini hidup di training/, paketnya di ../app.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def load_samples(root: Path) -> tuple[list[dict], int]:
    """Baca semua sidecar .json. Kembalikan (yang berlabel, jumlah belum berlabel)."""
    samples: list[dict] = []
    unlabeled = 0

    for sidecar in sorted(root.rglob("*.json")):
        try:
            data = json.loads(sidecar.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            print(f"  ! lewati {sidecar.name}: {e}", file=sys.stderr)
            continue

        # Belum dilabeli = truth_category masih null DAN truth_label masih null.
        # Keduanya null secara sah berarti "tidak ada sampah", jadi tanda yang
        # membedakan bukan nilainya, melainkan apakah kuncinya sudah disentuh.
        if not data.get("labeled", False) and data.get("truth_category") is None and data.get("truth_label") is None:
            unlabeled += 1
            continue

        image = sidecar.with_suffix(".jpg")
        if not image.is_file():
            print(f"  ! {sidecar.name} tanpa gambar pasangan — dilewati", file=sys.stderr)
            continue

        samples.append({**data, "_image": image, "_sidecar": sidecar})

    return samples, unlabeled


def rerun(samples: list[dict]) -> None:
    """Klasifikasi ulang tiap gambar dengan CV_MODE saat ini, timpa `predicted`."""
    from PIL import Image

    from app.config import get_settings
    from app.main import build_classifier

    settings = get_settings()
    print(f"  Memuat classifier: CV_MODE={settings.cv_mode} model={settings.cv_model_path}")
    classifier = build_classifier(settings)

    for i, sample in enumerate(samples, 1):
        with Image.open(sample["_image"]) as img:
            det = classifier.classify(img.convert("RGB"))

        # Ambang keyakinan diterapkan DI SINI juga, persis seperti di endpoint.
        # Tanpa itu, evaluasi menilai model pada jawaban yang tidak akan pernah
        # dilihat anak — dan angkanya jadi lebih bagus daripada kenyataan.
        below = det.confidence < settings.cv_confidence_threshold
        sample["predicted"] = {
            "category": None if below else det.category,
            "label": det.label,
            "confidence": det.confidence,
            "model_version": det.model_version,
            "degraded": det.degraded,
        }
        print(f"\r  {i}/{len(samples)}", end="", flush=True)
    print()


def normalize(name: str | None) -> str | None:
    """Samakan gaya penamaan sebelum dibandingkan.

    Model lokal menjawab `botol_plastik`, VLM menjawab "Botol Plastik". Keduanya
    jawaban yang sama dan harus dihitung sama — kalau tidak, mode cloud terlihat
    jauh lebih buruk daripada sebenarnya semata karena gaya penulisan.
    """
    if not name:
        return None
    return "_".join(name.strip().lower().replace("-", " ").replace("_", " ").split())


def report(samples: list[dict]) -> int:
    total = len(samples)
    if not total:
        print("Tidak ada sampel berlabel. Labeli dulu sidecar .json-nya.")
        return 1

    cat_ok = 0
    label_ok = 0
    label_scored = 0  # hanya frame yang PUNYA objek — nama objek tak berlaku untuk frame kosong
    degraded = 0

    empty_total = 0  # frame yang sungguh tidak berisi sampah
    empty_ok = 0  # ...dan model juga bilang begitu

    object_total = 0  # frame yang berisi sampah
    object_ok = 0  # ...dan kategorinya tepat
    object_missed = 0  # ...tapi model bilang tidak ada apa-apa

    confusion: dict[tuple[str, str], int] = defaultdict(int)
    per_class: dict[str, list[int]] = defaultdict(lambda: [0, 0])  # nama -> [benar, total]

    for s in samples:
        pred = s.get("predicted") or {}
        if pred.get("degraded"):
            degraded += 1

        truth_cat = s.get("truth_category")
        pred_cat = pred.get("category")

        if truth_cat is None:
            empty_total += 1
            if pred_cat is None:
                empty_ok += 1
                cat_ok += 1
            else:
                confusion[("kosong", pred_cat)] += 1
            continue

        object_total += 1
        if pred_cat is None:
            object_missed += 1
            confusion[(truth_cat, "tak-terdeteksi")] += 1
        elif pred_cat == truth_cat:
            cat_ok += 1
            object_ok += 1
        else:
            confusion[(truth_cat, pred_cat)] += 1

        truth_label = normalize(s.get("truth_label"))
        if truth_label:
            label_scored += 1
            per_class[truth_label][1] += 1
            if normalize(pred.get("label")) == truth_label:
                label_ok += 1
                per_class[truth_label][0] += 1

    def pct(n: int, d: int) -> str:
        return f"{n / d * 100:5.1f}%  ({n}/{d})" if d else "    —  (0/0)"

    print()
    print("═" * 62)
    print(f"  EVALUASI LAPANGAN — {total} frame berlabel")
    print("═" * 62)
    print()
    print("  Akurasi KATEGORI (menentukan tong mana yang dibuka)")
    print(f"    keseluruhan          {pct(cat_ok, total)}")
    print(f"    frame berisi objek   {pct(object_ok, object_total)}")
    print(f"    frame kosong benar   {pct(empty_ok, empty_total)}")
    print()
    print("  Akurasi NAMA OBJEK (menentukan label di layar & soal kuis)")
    print(f"    nama tepat           {pct(label_ok, label_scored)}")
    print()
    print("  Kegagalan yang perlu dilihat terpisah")
    print(f"    objek ada, dilewatkan   {pct(object_missed, object_total)}")
    print(f"    kosong, dipaksa berlabel {pct(empty_total - empty_ok, empty_total)}")
    print(f"    dijawab model cadangan  {pct(degraded, total)}")

    if per_class:
        print()
        print("  Per kelas (nama objek)")
        for name, (ok, tot) in sorted(per_class.items(), key=lambda kv: -kv[1][1]):
            bar = "█" * round(ok / tot * 20) if tot else ""
            print(f"    {name:<20} {pct(ok, tot)}  {bar}")

    if confusion:
        print()
        print("  Kesalahan (sebenarnya → dijawab)")
        for (truth, pred), n in sorted(confusion.items(), key=lambda kv: -kv[1]):
            print(f"    {truth:<12} → {pred:<16} {n}")

    print()
    if empty_total == 0:
        print("  ⚠ Tidak ada satu pun frame kosong di set ini. Model yang dilatih tanpa")
        print("    gambar latar WAJIB mengeluarkan salah satu kelasnya, jadi kelemahan")
        print("    terbesarnya justru tak terukur. Tambahkan frame tangan kosong & meja.")
    if degraded:
        print(f"  ⚠ {degraded} frame dijawab model cadangan, bukan jalur utama. Angka di atas")
        print("    mencampur dua model. Periksa /health sebelum mempercayainya.")
    print()

    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Ukur akurasi CV pada foto lapangan (bukan split dataset publik).",
    )
    ap.add_argument("dir", type=Path, help="folder hasil CV_CAPTURE_DIR")
    ap.add_argument(
        "--rerun",
        action="store_true",
        help="klasifikasi ulang tiap gambar dengan CV_MODE saat ini, bukan memakai prediksi tersimpan",
    )
    args = ap.parse_args()

    if not args.dir.is_dir():
        print(f"Folder tidak ada: {args.dir}", file=sys.stderr)
        return 2

    samples, unlabeled = load_samples(args.dir)
    print(f"  {len(samples)} berlabel · {unlabeled} belum dilabeli")
    if unlabeled:
        print(f"  (isi truth_label & truth_category di {unlabeled} sidecar untuk ikut dihitung)")

    if args.rerun and samples:
        rerun(samples)

    return report(samples)


if __name__ == "__main__":
    raise SystemExit(main())
