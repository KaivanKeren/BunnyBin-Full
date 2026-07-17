# Melatih & Menyiapkan Model YOLO BunnyBin

Panduan menyiapkan model deteksi objek (organik/anorganik) untuk CV service.
Ada **dua jalur**: model **demo** (bisa diuji sekarang) dan model **kustom produksi**.

> Semua perintah dijalankan dari folder `cv-service-fastapi/training/`.

---

## 0. Prasyarat (real mode)

`torch`/`ultralytics` butuh **Python 3.11 atau 3.12** (belum tentu ada wheel untuk 3.14).
Buat venv terpisah khusus real mode:

```bash
cd cv-service-fastapi
python3.11 -m venv .venv-real
source .venv-real/bin/activate
pip install -r requirements.txt -r requirements-real.txt
```

---

## 1. Jalur DEMO — uji sekarang tanpa dataset

Memakai bobot pretrained COCO (yolov8n, 80 objek umum) yang dipetakan ke
organik/anorganik lewat `LABEL_MAP` di [`app/config.py`](../app/config.py).
Cocok untuk memverifikasi seluruh pipa kamera → deteksi → kategori **sebelum**
model kustom siap.

```bash
cd training
python make_demo_model.py          # -> ../models/best-demo.pt

# Uji inference terhadap foto objek nyata:
CV_MODE=real CV_MODEL_PATH=../models/best-demo.pt \
  python smoke_real_inference.py foto-pisang.jpg foto-botol.jpg
```

Jalankan service penuh dalam demo real mode:

```bash
cd cv-service-fastapi
CV_MODE=real CV_MODEL_PATH=models/best-demo.pt \
  uvicorn app.main:app --port 8801
# POST /classify {"image_base64": "..."} -> {category, confidence, bbox}
```

**Keterbatasan demo:** COCO hanya kenal 80 objek umum; objek yang tak dipetakan
(atau di bawah `CV_CONFIDENCE_THRESHOLD`) → `category: null`. Bukan akurasi produksi.

---

## 2. Jalur PRODUKSI — model kustom 2-kelas

### a. Kumpulkan & label data
- Foto sampah asli dari sudut & pencahayaan bin sebenarnya (makin mirip kondisi
  lapangan makin baik). Target minimal ratusan gambar per kelas.
- Label dengan bounding box memakai [Roboflow](https://roboflow.com),
  [LabelImg](https://github.com/HumanSignal/labelImg), atau CVAT — ekspor **format YOLO**.
- Susun ke struktur di [`data.yaml`](./data.yaml):

  ```
  training/dataset/
    images/train/*.jpg   labels/train/*.txt
    images/val/*.jpg     labels/val/*.txt
  ```
  `class_id`: `0=organic`, `1=inorganic` (WAJIB urut sesuai `names` di data.yaml).

### b. Latih
```bash
python train.py --epochs 100 --imgsz 640          # CPU (lambat) / auto-GPU bila ada
python train.py --epochs 200 --model yolov8s.pt --device 0   # GPU, model lebih besar
```
Hasil terbaik: `runs/detect/bunnybin*/weights/best.pt`.

### c. Deploy
```bash
cp runs/detect/bunnybin*/weights/best.pt ../models/best.pt
cd ../.. && CV_MODE=real CV_MODEL_PATH=models/best.pt uvicorn app.main:app
```

Nama kelas model kustom (`organic`/`inorganic`) sudah cocok dengan `LABEL_MAP`
(identity) — tak perlu ubah kode.

---

## 3. Docker (real mode)

`docker-compose.yml` punya contoh (ter-comment) untuk menjalankan cv-service real
mode: build dengan `INSTALL_REAL=true`, mount folder `models/` ke `/model`, set
`CV_MODE=real` & `CV_MODEL_PATH=/model/best.pt`. Lihat komentar di file compose.

---

## Ringkasan file

| File | Fungsi |
|---|---|
| `data.yaml` | konfigurasi dataset 2-kelas |
| `train.py` | latih model kustom (transfer learning) |
| `make_demo_model.py` | hasilkan model demo COCO (`models/best-demo.pt`) |
| `smoke_real_inference.py` | smoke-test inference nyata tanpa hardware |
| `../requirements-real.txt` | dependency real mode (ultralytics, opencv) |
| `../models/` | tempat menaruh `best.pt` / `best-demo.pt` (git-ignored) |
