# PRD: BunnyBin CV Service — FastAPI Klasifikasi Sampah

| | |
|---|---|
| **Fokus dokumen** | Service Python internal untuk klasifikasi gambar sampah (organic/inorganic). Stateless, hanya dipanggil Laravel. |
| **Parent** | `PRD-Webapp-FullStack.md` §7 |
| **Dependensi** | Tidak ada dependensi ke DB. Kontrak dikonsumsi `PRD-Backend-Laravel.md` §4.1 |
| **Target** | Claude Code — Fase 5 roadmap master PRD |

---

## 1. Prinsip

- **Stateless total**: tidak menyentuh PostgreSQL, tidak menyimpan file. Terima gambar → return JSON.
- **Dua mode via env** `CV_MODE=dummy|real`:
  - `dummy` (default MVP): return hasil deterministik tanpa model — supaya integrasi end-to-end bisa diuji sebelum model siap.
  - `real`: load model saat startup, inference sungguhan.
- Model interchangeable — arsitektur inference di balik satu interface, model spesifik (YOLO/MobileNet) diputuskan di `PRD-Software-CV.md`, bukan di sini.

---

## 2. Struktur

```
cv-service-fastapi/
├── app/
│   ├── main.py           # FastAPI app, routes
│   ├── schemas.py        # Pydantic models
│   ├── inference/
│   │   ├── base.py       # class Classifier(ABC): classify(image) -> Detection
│   │   ├── dummy.py      # DummyClassifier
│   │   └── yolo.py       # YoloClassifier (real mode)
│   └── config.py         # settings via pydantic-settings
├── model/                # weight file (real mode), di-mount volume
├── tests/
│   └── test_classify.py
├── requirements.txt
├── Dockerfile
└── .env.example
```

**requirements.txt (MVP):**
```
fastapi
uvicorn[standard]
pydantic-settings
pillow
python-multipart
# real mode (uncomment saat model siap):
# ultralytics
# opencv-python-headless
```

---

## 3. Kontrak API

### POST `/classify`
Request:
```json
{ "image_base64": "<base64 JPEG/PNG>" }
```
Response 200:
```json
{
  "category": "organic",
  "confidence": 0.87,
  "bbox": [0.15, 0.12, 0.65, 0.78],
  "model_version": "dummy-1" 
}
```
- `category` bisa `null` bila confidence < threshold (`CV_CONFIDENCE_THRESHOLD`, default 0.6) atau tidak ada objek terdeteksi.
- `bbox` `[x1, y1, x2, y2]` normalized 0-1 (fraction dari dimensi gambar), `null` bila tidak relevan.
- Error 422: base64 invalid / bukan gambar. Error 400: gambar > `CV_MAX_IMAGE_MB` (default 5 MB).

### GET `/health`
```json
{ "status": "ok", "mode": "dummy", "model_loaded": false }
```
Dipakai Docker healthcheck & monitoring.

---

## 4. Implementasi Kunci

### 4.1 schemas.py
```python
from typing import Literal
from pydantic import BaseModel, Field

class ClassifyRequest(BaseModel):
    image_base64: str = Field(min_length=1)

class ClassifyResponse(BaseModel):
    category: Literal["organic", "inorganic"] | None
    label: str | None = None
    confidence: float = Field(ge=0, le=1)
    bbox: tuple[float, float, float, float] | None  # normalized 0-1
    model_version: str
```

### 4.2 DummyClassifier
Deterministik supaya test Laravel reproducible:
- Decode gambar via Pillow (validasi gambar sungguhan).
- Hitung mean brightness: brightness < 128 → `organic` (0.85), selain itu → `inorganic` (0.85).
- Dengan begitu tim FE/BE bisa memancing kedua kategori secara sengaja (kirim gambar gelap vs terang).

### 4.3 Real mode (yolo.py)
- Load weight sekali di startup (`lifespan` FastAPI), simpan di `app.state.classifier`.
- Path weight dari env `CV_MODEL_PATH=/model/best.pt`.
- Inference single image, ambil deteksi confidence tertinggi.
- Mapping label model → `organic`/`inorganic` via dict di `config.py`.
- Jika weight tidak ditemukan saat `CV_MODE=real` → **fail fast** saat startup (jangan silent fallback ke dummy).

### 4.4 main.py
```python
@app.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest):
    image = decode_and_validate(req.image_base64)   # raises 422/400
    return app.state.classifier.classify(image)
```
Inference model berat → jalankan di threadpool (`run_in_executor`) supaya event loop tidak keblokir.

---

## 5. Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ ./app
EXPOSE 8000
HEALTHCHECK CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```
Container **tidak** publish port ke host — hanya `expose` di internal Docker network (lihat `PRD-Infrastructure-Deployment.md`).

---

## 6. Testing

`pytest` + `httpx.AsyncClient`:
- `/classify` gambar valid gelap → organic; terang → inorganic (dummy mode).
- Base64 rusak → 422.
- Gambar oversize → 400.
- `/health` → mode & model_loaded sesuai env.

---

## 7. Definisi Selesai

- `docker compose up cv-service` sehat (healthcheck pass).
- Dari container Laravel: `POST http://cv-service:8000/classify` sukses.
- Test `CvProxyTest.php` di Laravel (dengan CV service asli, bukan fake) hijau.
- Ganti `CV_MODE=real` + mount weight → startup load model tanpa ubah kode.
