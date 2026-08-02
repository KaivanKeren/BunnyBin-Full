# Melatih model deteksi OBJEK BERNAMA (10 kelas)

Model organik/anorganik saat ini (Roboflow Cloud) **akurat untuk kategori** tapi
hanya mengeluarkan `Sampah Organik` / `Sampah Anorganik` — bukan nama objek.

Untuk menampilkan nama objek (mis. "Botol Plastik") **dengan akurat**, kamu perlu
melatih model sendiri. Tidak ada jalan pintas yang akurat:

> **Bukti empiris (2026-07-26):** model publik "objek bernama" di Roboflow Universe
> (mAP 30–93% di dataset sendiri) diuji ke foto nyata → **botol plastik dikenali
> sebagai "battery" 0.87**, gelas plastik → "gadget". mAP tinggi hanya berlaku di
> validation set internal mereka; ke gambar nyata mereka gagal. Karena itu akurasi
> menuntut training di data yang **mewakili tampilan kamera kiosk-mu sendiri**.

## 10 kelas (lihat `data_named.yaml` & `LABEL_MAP_NAMED` di `app/config.py`)

| id | nama (label model) | kategori bin |
|----|--------------------|--------------|
| 0  | `kulit_buah`       | organik      |
| 1  | `daun_hijau`       | organik      |
| 2  | `daun_kering`      | organik      |
| 3  | `rumput`           | organik      |
| 4  | `sisa_makanan`     | organik      |
| 5  | `botol_plastik`    | anorganik    |
| 6  | `gelas_plastik`    | anorganik    |
| 7  | `sedotan_plastik`  | anorganik    |
| 8  | `wadah_plastik`    | anorganik    |
| 9  | `bungkus_snack`    | anorganik    |

Ubah daftar ini di **DUA tempat yang harus selaras**: `data_named.yaml` (`names`)
dan `LABEL_MAP_NAMED` (`app/config.py`). Urutan id wajib sama.

## Langkah

### 1. Kumpulkan & anotasi data (cara paling akurat)
Foto tiap objek **seperti kondisi kiosk nyata**: satu objek, dipegang/di depan
kamera, latar bin, pencahayaan ruangan. Target awal ±100–200 foto/kelas.

Anotasi bounding-box paling mudah via **Roboflow** (gratis):
1. Buat project *Object Detection*, upload foto, tarik box + beri label sesuai 10
   nama di atas.
2. Generate version → **Export → format "YOLOv8"** → download `.zip`.
3. Ekstrak ke `training/dataset_named/` sehingga jadi:
   ```
   dataset_named/images/train/*.jpg   dataset_named/labels/train/*.txt
   dataset_named/images/val/*.jpg     dataset_named/labels/val/*.txt
   ```
   (Export Roboflow YOLOv8 sudah bikin struktur ini; cukup sesuaikan `path` di
   `data_named.yaml` bila perlu, atau timpa file `data.yaml` bawaan export dengan
   `data_named.yaml` ini agar id kelas terjaga.)

> Alternatif tanpa anotasi manual: pakai `prepare_dataset.py` (dataset publik)
> — tapi itu hanya menghasilkan 2 kelas organik/anorganik, **bukan** 10 nama objek.

### 2. Latih (GPU sangat disarankan; CPU bisa berjam-jam)
```bash
cd cv-service-fastapi/training
../.venv-real/bin/python train.py \
    --data data_named.yaml --name bunnybin-named \
    --epochs 100 --imgsz 640 --device 0     # --device cpu bila tanpa GPU
```
Auto-resume bila terputus (jalankan ulang perintah yang sama).

### 3. Deploy
```bash
cp runs/bunnybin-named/weights/best.pt ../models/best.pt
```
Set CV service ke mode lokal:
```
CV_MODE=real
CV_MODEL_PATH=/model/best.pt      # docker: mount models/ -> /model
```
Service akan otomatis mengeluarkan `label` = nama objek (mis. `botol_plastik`) dan
`category` = organik/anorganik (via `LABEL_MAP_NAMED`). Frontend mempercantik jadi
"Botol Plastik" (`src/lib/prettyLabel.ts`).

## Verifikasi
```bash
../.venv-real/bin/python -c "
from PIL import Image; from app.inference.yolo import YoloClassifier
c=YoloClassifier('models/best.pt')
print(c.classify(Image.open('foto_uji.jpg').convert('RGB')))
"
```
Cek `label` = nama objek benar dan `category` sesuai. Bila akurasi kurang: tambah
data untuk kelas yang sering salah, latih ulang.
