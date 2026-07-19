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

Ada **dua sumber data**: dataset publik siap-pakai (2a) atau data lapangan sendiri (2b).

### 2a. Dari dataset PUBLIK (dipakai di project ini)

Memakai [`keremberke/garbage-object-detection`](https://huggingface.co/datasets/keremberke/garbage-object-detection)
(Roboflow "garbage-classification-3", format COCO, 6 kelas). Script
[`prepare_dataset.py`](./prepare_dataset.py) meng-collapse 6 kelas ke 2:
`biodegradable → organic`, sisanya (`cardboard/glass/metal/paper/plastic`) → `inorganic`.

```bash
# 1. Unduh split dari HuggingFace (tanpa kredensial):
mkdir -p raw
BASE=https://huggingface.co/datasets/keremberke/garbage-object-detection/resolve/main/data
curl -L $BASE/train.zip -o raw/train.zip
curl -L $BASE/valid.zip -o raw/valid.zip

# 2. Konversi COCO -> YOLO 2-kelas (opsi --max-* untuk latihan cepat di CPU):
python prepare_dataset.py --raw raw --out dataset --max-train 2500 --max-val 500
# -> dataset/images/{train,val}, dataset/labels/{train,val}

# 3. Latih (lanjut ke 2c).
```

Dataset lain (mis. Kaggle "Waste Classification", TACO) bisa dipakai: sesuaikan
`ORGANIC_SOURCE` / logika di `prepare_dataset.py` agar nama kelas sumber terpetakan benar.

### 2b. Dari data lapangan sendiri (akurasi produksi terbaik)
- Foto sampah asli dari sudut & pencahayaan bin sebenarnya. Target ratusan+ gambar/kelas.
- Label bbox dengan [Roboflow](https://roboflow.com), [LabelImg](https://github.com/HumanSignal/labelImg),
  atau CVAT — ekspor **format YOLO**, `class_id`: `0=organic`, `1=inorganic`
  (WAJIB urut sesuai `names` di [`data.yaml`](./data.yaml)). Susun ke `dataset/images|labels/{train,val}`.

### 2c. Latih
```bash
python train.py --epochs 40 --imgsz 416           # dataset publik di atas (gambar 416px)
python train.py --epochs 100 --imgsz 640          # data sendiri, CPU (lambat)
python train.py --epochs 200 --model yolov8s.pt --device 0   # GPU, model lebih besar
```
Hasil terbaik: `runs/detect/bunnybin*/weights/best.pt`.

> **Catatan CPU:** melatih di CPU jauh lebih lambat & akurasinya terbatas oleh
> epoch/subset. Untuk produksi, gunakan GPU + dataset penuh + epoch lebih banyak.

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
| `prepare_dataset.py` | unduh/konversi dataset publik (COCO→YOLO, collapse 6→2 kelas) |
| `train.py` | latih model kustom (transfer learning) |
| `make_demo_model.py` | hasilkan model demo COCO (`models/best-demo.pt`) |
| `smoke_real_inference.py` | smoke-test inference nyata tanpa hardware |
| `../requirements-real.txt` | dependency real mode (ultralytics, opencv) |
| `../models/` | tempat menaruh `best.pt` / `best-demo.pt` (git-ignored) |
