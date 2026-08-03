"""Latih model YOLO kustom 2-kelas (organic/inorganic) untuk Binexa.

Prasyarat:
    pip install -r ../requirements.txt -r ../requirements-real.txt
    Dataset sudah tersedia di training/dataset/ (lihat data.yaml).

Contoh:
    python train.py                          # default: yolov8n, 100 epoch, 640px
    python train.py --epochs 200 --model yolov8s.pt --imgsz 640
    python train.py --device 0               # pakai GPU index 0 (default: cpu bila tak ada GPU)

Auto-resume: jika training terputus, jalankan ulang tanpa argumen tambahan —
script akan mendeteksi last.pt dan melanjutkan dari checkpoint terakhir.

Hasil terbaik: runs/detect/train*/weights/best.pt
Salin ke lokasi CV_MODEL_PATH (mis. cv-service-fastapi/models/best.pt), lalu:
    CV_MODE=real CV_MODEL_PATH=models/best.pt uvicorn app.main:app
"""

import argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent


def main() -> None:
    parser = argparse.ArgumentParser(description="Latih model YOLO Binexa")
    parser.add_argument("--model", default="yolov8n.pt", help="base weight (transfer learning)")
    parser.add_argument("--data", default=str(HERE / "data.yaml"))
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--fraction", type=float, default=1.0,
                        help="pakai sebagian data train (mis. 0.4) — untuk latihan cepat di CPU")
    parser.add_argument("--device", default=None, help="cuda index (mis. 0) atau 'cpu'")
    parser.add_argument("--name", default="binexa", help="nama run")
    args = parser.parse_args()

    from ultralytics import YOLO
    from ultralytics import settings as ul_settings

    # data.yaml memakai `path: ./dataset` (relatif). Ultralytics me-resolve path
    # relatif terhadap datasets_dir, jadi arahkan ke folder training/ ini agar
    # ./dataset -> training/dataset tanpa hardcode path absolut di data.yaml.
    ul_settings.update({"datasets_dir": str(HERE)})

    # Auto-resume: cari last.pt TERBARU di runs/<name>* (ultralytics kadang
    # menambah sufiks -2/-3 bila folder sudah ada, jadi jangan hanya cek <name>).
    # Ambil checkpoint paling baru agar `python train.py ...` yang sama otomatis
    # melanjutkan run yang terputus, bukan mulai dari nol.
    resume = False
    model_source = args.model

    candidates = sorted(
        (HERE / "runs").glob(f"{args.name}*/weights/last.pt"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if candidates:
        model_source = str(candidates[0])
        resume = True
        print(f"Auto-resume dari checkpoint: {candidates[0]}")

    model = YOLO(model_source)  # base pretrained (auto-download saat pertama)
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        name=args.name,
        project=str(HERE / "runs"),  # output ke training/runs/ (gitignored)
        resume=resume,
        fraction=args.fraction,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    print(f"\n✅ Selesai. Weight terbaik: {best}")
    print("   Deploy: salin ke models/best.pt lalu set CV_MODE=real, CV_MODEL_PATH=models/best.pt")


if __name__ == "__main__":
    main()
