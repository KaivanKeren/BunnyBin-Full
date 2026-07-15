# BunnyBin

**Tempat sampah pintar edukatif untuk sekolah** — memilah sampah organik/anorganik secara otomatis dengan Computer Vision, memberi kuis edukasi ke anak lewat layar kiosk, dan memantau seluruh unit dari dashboard admin secara real-time.

BunnyBin menghubungkan tiga dunia: perangkat IoT di lapangan (ESP32 + kamera + sensor), layanan cloud yang memproses dan menyimpan data, serta antarmuka untuk anak (kiosk) dan pengelola (admin). Tujuannya mendukung program pemilahan sampah di sekolah sekaligus mengedukasi siswa.

---

## Daftar Isi

1. [Ringkasan & Fitur](#1-ringkasan--fitur)
2. [Arsitektur Sistem](#2-arsitektur-sistem)
3. [Tech Stack](#3-tech-stack)
4. [Struktur Repositori](#4-struktur-repositori)
5. [Prasyarat](#5-prasyarat)
6. [Cara Menjalankan (Development)](#6-cara-menjalankan-development)
7. [Menjalankan Tanpa Hardware (Mode Simulasi)](#7-menjalankan-tanpa-hardware-mode-simulasi)
8. [Akun Login & Data Seed](#8-akun-login--data-seed)
9. [Referensi API](#9-referensi-api)
10. [Ingestion MQTT](#10-ingestion-mqtt)
11. [Variabel Environment](#11-variabel-environment)
12. [Testing](#12-testing)
13. [Dokumentasi Lanjutan](#13-dokumentasi-lanjutan)

---

## 1. Ringkasan & Fitur

BunnyBin terdiri dari empat komponen software yang bekerja sama:

| Komponen | Peran |
|---|---|
| **Backend (Laravel)** | Otak sistem — satu-satunya sumber kebenaran data. Menyediakan REST API, menerima data sensor via MQTT, memproses alert, dan menjadi orkestrator ke layanan CV. |
| **CV Service (FastAPI)** | Layanan *stateless* untuk klasifikasi gambar sampah (organik/anorganik). Tidak pernah menyentuh database — hanya menerima gambar dan mengembalikan hasil. |
| **Frontend Admin (React)** | Dashboard web untuk sekolah & pengelola: monitoring status bin, riwayat sortir, alert, manajemen kuis, dan manajemen sekolah/unit. |
| **Frontend Kiosk (React)** | Antarmuka layar yang menempel di trash bin, ditujukan untuk anak — animasi, kuis edukasi, dan feedback hasil sortir. |

**Fitur utama:**

- 🗑️ **Pemilahan otomatis** — kamera menangkap sampah, CV mengklasifikasi organik vs anorganik.
- 📊 **Monitoring real-time** — fill level (tingkat penuh) tiap kompartemen per unit, status online/offline.
- 📈 **Riwayat time-series** — setiap event sortir & snapshot sensor tersimpan sebagai hypertable TimescaleDB.
- 🔔 **Alert otomatis** — notifikasi saat bin penuh (≥70% / ≥90%) atau unit offline (>15 menit).
- 🎓 **Bank kuis edukasi** — soal edukasi yang muncul di kiosk, dikelola oleh super admin.
- 🏫 **Multi-tenant** — banyak sekolah, tiap sekolah punya admin dan unit sendiri, dengan RBAC (`super_admin` / `school_admin`).
- 🔌 **Ingestion IoT** — ESP32 mengirim data via MQTT ke broker Mosquitto, diproses oleh queue worker Laravel.

---

## 2. Arsitektur Sistem

```
                                   ┌─────────────────────────┐
                                   │   Kiosk UI (per bin)     │
                                   │   React/Vite             │
                                   └───────────┬──────────────┘
                                               │ REST (Sanctum token per-unit)
                                               ▼
┌──────────────┐   MQTT    ┌─────────────────────────────────────────┐
│  ESP32 (bin) │──────────▶│           Mosquitto Broker              │
└──────────────┘           └───────────────────┬─────────────────────┘
                                                │ subscribe bunnybin/+/#
                                                ▼
                                ┌───────────────────────────────┐
                                │  Laravel App (Backend utama)  │
                                │  - REST API (Sanctum auth)    │
                                │  - MQTT Listener (queue job)  │
                                │  - Alert engine + scheduler   │
                                └───────┬───────────────┬───────┘
                                        │ HTTP internal │
                                        ▼               ▼
                        ┌───────────────────────┐   ┌─────────────────────┐
                        │ FastAPI CV Service     │   │ PostgreSQL +         │
                        │ (klasifikasi gambar)   │   │ TimescaleDB          │
                        └───────────────────────┘   └─────────────────────┘
                                        ▲
                                        │ REST (dashboard)
                        ┌───────────────────────────────┐
                        │ Admin Dashboard (React/Vite)   │
                        └───────────────────────────────┘
```

**Prinsip kunci:**

- **Laravel = satu-satunya sumber kebenaran.** Hanya Laravel yang bicara ke database.
- **CV service stateless.** Tidak pernah menyentuh DB — hanya terima gambar, kembalikan klasifikasi.
- **Dua frontend, satu backend.** Kiosk dan Admin sama-sama konsumen REST API Laravel.
- **ESP32 tidak pernah memanggil CV service langsung** — semua lewat Laravel sebagai orkestrator.

---

## 3. Tech Stack

| Layer | Teknologi |
|---|---|
| Backend utama | **Laravel 12** + Laravel Sanctum (auth) + `php-mqtt/laravel-client` |
| CV service | **FastAPI** (Python 3.11+), Pillow, Uvicorn |
| Database | **PostgreSQL 15 + TimescaleDB** (relational + time-series dalam satu DB) |
| Message broker | **Eclipse Mosquitto 2** (MQTT) |
| Frontend Admin | **React 19 + TypeScript + Vite**, React Router, TanStack Query, Recharts |
| Frontend Kiosk | **React 19 + TypeScript + Vite**, Framer Motion, Lucide |
| Styling | **Tailwind CSS v4** |
| Kontainerisasi | **Docker Compose** |

---

## 4. Struktur Repositori

Monorepo dengan empat layanan independen:

```
BunnyBin-V2/
├── backend/                    # Laravel 12 — REST API, MQTT listener, alert engine
│   ├── app/
│   │   ├── Http/Controllers/Api/   # Auth, School, Unit, QuizItem, SortLog, Alert, Dashboard, CvProxy
│   │   ├── Models/                 # School, Unit, AdminUser, QuizItem, SortLog, FillSnapshot, ...
│   │   ├── Console/Commands/       # MqttListen, SimulateDevices, IssueUnitToken
│   │   ├── Jobs/                   # ProcessSensorReading (queue)
│   │   └── Services/               # CvClientService, AlertEngineService
│   ├── database/
│   │   ├── migrations/             # skema DB (termasuk hypertable TimescaleDB)
│   │   └── seeders/DatabaseSeeder.php
│   ├── routes/api.php              # definisi endpoint REST
│   └── .env.example
│
├── cv-service-fastapi/         # FastAPI — klasifikasi gambar (stateless)
│   ├── app/
│   │   ├── main.py                 # endpoint /classify & /health
│   │   ├── schemas.py              # ClassifyRequest / ClassifyResponse
│   │   ├── config.py               # CV_MODE (dummy | real)
│   │   └── inference/              # logika inference
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/                   # Admin Dashboard (React) — nama paket: frontend-admin
│   └── src/pages/              # Login, DashboardOverview, UnitDetail, SortLogs, Alerts,
│                               # QuizManagement, SchoolUnitManagement
│
├── frontend-kiosk/             # Kiosk UI on-device (React)
│   └── src/                    # screens, machine (state), mocks, api, context, debug panel
│
├── docker/
│   ├── docker-compose.yml      # dependensi DEV: TimescaleDB, Mosquitto, CV service
│   └── mosquitto/mosquitto.conf

```

---

## 5. Prasyarat

Pastikan tools berikut terpasang di mesin development:

- **PHP 8.2+** dengan Composer
- **Node.js 20+** dengan npm
- **Python 3.11+** (untuk CV service, jika dijalankan di host)
- **Docker + Docker Compose** (untuk database, MQTT broker, dan CV service)

> **Catatan host tanpa ext-simplexml:** jika PHP di mesin Anda tidak punya ekstensi `simplexml`, gunakan platform override Composer (`composer install --ignore-platform-req=ext-simplexml`) atau setel `config.platform` di `composer.json`.

---

## 6. Cara Menjalankan (Development)

Arsitektur dev: **infrastruktur (DB, MQTT, CV) jalan di Docker**, sedangkan **Laravel & frontend jalan di host** agar mudah di-debug dan hot-reload.

### Langkah 1 — Jalankan dependensi (Docker)

Dari root repo:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Ini menyalakan:

| Service | Host port | Keterangan |
|---|---|---|
| `timescaledb` | `127.0.0.1:5433` | PostgreSQL + TimescaleDB (DB: `bunnybin`, user/pass: `bunnybin`) |
| `mosquitto` | `1883` | MQTT broker |
| `cv-service` | `127.0.0.1:8800` | FastAPI CV (mode `dummy`) |

### Langkah 2 — Backend (Laravel)

```bash
cd backend

# Install dependency
composer install

# Siapkan environment
cp .env.example .env
php artisan key:generate

# Arahkan .env ke DB Docker dev (port 5433):
#   DB_HOST=127.0.0.1
#   DB_PORT=5433
#   DB_DATABASE=bunnybin
#   DB_USERNAME=bunnybin
#   DB_PASSWORD=bunnybin
#   MQTT_HOST=127.0.0.1
#   MQTT_PORT=1883
#   CV_SERVICE_URL=http://127.0.0.1:8800

# Migrasi + seed data contoh
php artisan migrate --seed

# Jalankan web server (default http://localhost:8000)
php artisan serve
```

Backend juga butuh **queue worker** (memproses job ingestion sensor) dan opsional **MQTT listener**. Buka terminal terpisah:

```bash
# Terminal: queue worker (wajib untuk ingestion & alert)
php artisan queue:work

# Terminal: MQTT listener (subscribe bunnybin/+/#)
php artisan mqtt:listen
```

> **Tips:** `composer dev` menjalankan server + queue + log (Pail) + Vite sekaligus lewat `concurrently`.

Untuk alert offline otomatis, jalankan scheduler (memanggil `sweepOffline` tiap 5 menit):

```bash
php artisan schedule:work
```

### Langkah 3 — Frontend Admin

```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_URL=http://localhost:8000/api
npm run dev                 # default http://localhost:5173
```

### Langkah 4 — Frontend Kiosk

```bash
cd frontend-kiosk
npm install
cp .env.example .env
npm run dev
```

Kiosk bisa jalan dalam **mock mode** (`VITE_USE_MOCK=true`, tanpa backend) atau **real mode** (butuh token Sanctum per-unit, lihat [Mode Simulasi](#7-menjalankan-tanpa-hardware-mode-simulasi)).

### Langkah 5 — CV Service (opsional, di host)

CV service sudah jalan lewat Docker (Langkah 1). Jika ingin menjalankannya langsung di host:

```bash
cd cv-service-fastapi
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Mode inference dikontrol variabel `CV_MODE` (`dummy` = respons palsu untuk pengembangan; `real` = model asli, uncomment `ultralytics`/`opencv` di `requirements.txt`).

---

## 7. Menjalankan Tanpa Hardware (Mode Simulasi)

Karena perangkat ESP32 fisik belum tentu tersedia, ada simulator yang mem-publish MQTT **persis seperti device asli**, sehingga data mengalir lewat pipeline nyata (`mqtt:listen → ProcessSensorReading → DB → dashboard`).

**Service yang harus hidup:** `timescaledb`, `mosquitto`, backend dengan `queue:work` dan `mqtt:listen`.

```bash
# 1. Pastikan Docker (DB + Mosquitto) & backend berjalan, DB sudah di-seed.

# 2. Terminal A — MQTT listener
php artisan mqtt:listen

# 3. Terminal B — queue worker
php artisan queue:work

# 4. Terminal C — simulator device
php artisan simulate:devices              # tick tiap 5 detik
php artisan simulate:devices --interval=2 # atur jeda
php artisan simulate:devices --once       # satu tick lalu berhenti (untuk uji)
```

Simulator mem-publish `sensor`, `sort`, dan `heartbeat` untuk tiap unit berstatus `active`. Buka Admin Dashboard untuk melihat fill level naik, sort log bertambah, dan alert muncul saat threshold tercapai.

**Token kiosk untuk mode real** (kiosk memakai Sanctum token per-unit dengan ability `kiosk`):

```bash
php artisan unit:token BNB-001
# Salin token ke frontend-kiosk/.env → VITE_KIOSK_API_TOKEN=...
# dan setel VITE_UNIT_CODE=BNB-001, VITE_USE_MOCK=false
```

---

## 8. Akun Login & Data Seed

`php artisan migrate --seed` membuat data contoh berikut:

| Peran | Email | Password | Akses |
|---|---|---|---|
| Super Admin | `admin@bunnybin.id` | `password` | Semua sekolah, semua unit, kelola kuis & sekolah |
| School Admin | (email admin sekolah tiap seed) | `password` | Hanya sekolah miliknya |

> Password default berasal dari `SEED_ADMIN_PASSWORD` (default `password`). **Ganti di produksi.**

**Sekolah & unit contoh:**

- **SDN 1 Kudus** — `BNB-001` (Kelas 3A, active), `BNB-002` (Kantin, active), `BNB-003` (Perpustakaan, maintenance)
- **SDN 2 Demak** — `BNB-004` (Lapangan, active), `BNB-005` (UKS, offline)

Seed juga mengisi bank kuis, sebagian riwayat sortir, maintenance event, dan alert contoh.

---

## 9. Referensi API

Base URL: `/api` — Auth: **Laravel Sanctum**.

| Method | Endpoint | Deskripsi | Role |
|---|---|---|---|
| POST | `/auth/login` | Login admin | public |
| POST | `/auth/logout` | Logout | authenticated |
| GET | `/auth/me` | Profil admin login | authenticated |
| GET | `/dashboard/summary` | Ringkasan: unit aktif, avg fill, alert belum dibaca | all |
| GET | `/units` | List unit (scoped ke sekolah admin) | all |
| GET | `/units/{id}` | Detail unit + status terkini | all |
| GET | `/units/{id}/fill-history` | Time-series fill level | all |
| GET | `/units/{id}/sort-logs` | Riwayat sortir (paginated) | all |
| POST/PUT/DELETE | `/units` · `/units/{id}` | CRUD unit | super_admin |
| GET | `/sort-logs` | Riwayat sortir global | all |
| GET | `/quiz-items` | List bank kuis | all |
| POST/PUT/DELETE | `/quiz-items/{id}` | CRUD kuis | super_admin |
| GET/POST/PUT/DELETE | `/schools` · `/schools/{id}` | CRUD sekolah | super_admin |
| GET | `/alerts` | List alert (scoped) | all |
| PATCH | `/alerts/{id}/read` | Tandai alert dibaca | all |
| POST | `/cv/classify` | Proxy klasifikasi ke CV service | token unit (kiosk) |

**RBAC:** middleware `role:super_admin` membatasi operasi write, dan query otomatis di-scope ke `school_id` admin login kecuali `super_admin`.

**CV Service (internal, tidak diekspos publik):**

- `POST /classify` — body `{ "image_base64": "..." }` → `{ "category": "organic"|"inorganic"|null, "confidence": float, "bbox": [...] }`
- `GET /health` — health check

---

## 10. Ingestion MQTT

**Topik** (`{unit_code}` = kode unit, mis. `BNB-001`):

| Topik | Payload |
|---|---|
| `bunnybin/{unit_code}/sensor` | `{"organic_pct": 42, "inorganic_pct": 68, "ts": "..."}` |
| `bunnybin/{unit_code}/sort` | `{"category": "organic", "ts": "..."}` |
| `bunnybin/{unit_code}/heartbeat` | `{"status": "online", "ts": "..."}` |
| `bunnybin/{unit_code}/cmd` | Command Laravel → ESP32 (opsional) |

**Alur pemrosesan:**

1. `php artisan mqtt:listen` subscribe `bunnybin/+/#`.
2. Tiap pesan → dispatch job `ProcessSensorReading` ke queue.
3. Job parse `unit_code`, cari `unit_id`, insert ke `fill_snapshots` / `sort_logs`, update `units.last_seen_at`.
4. `AlertEngineService` cek threshold (≥70% → `fill_70`, ≥90% → `fill_90`), buat alert (dengan anti-spam).
5. Scheduler tiap 5 menit menandai unit `offline` bila `last_seen_at` tak update >15 menit + buat alert.

---

## 11. Variabel Environment

### Backend (`backend/.env`)

| Variabel | Contoh (dev) | Keterangan |
|---|---|---|
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `5433` | DB Docker dev |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | `bunnybin` | kredensial DB |
| `MQTT_HOST` / `MQTT_PORT` | `127.0.0.1` / `1883` | broker Mosquitto |
| `CV_SERVICE_URL` | `http://127.0.0.1:8800` | endpoint CV service |
| `QUEUE_CONNECTION` | `database` | driver queue |
| `SANCTUM_STATEFUL_DOMAINS` | `localhost:5173` | domain FE untuk cookie Sanctum |
| `SEED_ADMIN_PASSWORD` | `password` | password akun seed |

### Frontend Admin (`frontend/.env`)

| Variabel | Contoh |
|---|---|
| `VITE_API_URL` | `http://localhost:8000/api` |

### Frontend Kiosk (`frontend-kiosk/.env`)

| Variabel | Keterangan |
|---|---|
| `VITE_USE_MOCK` | `true` = jalan tanpa backend; `false` = real mode |
| `VITE_API_URL` | endpoint API Laravel |
| `VITE_KIOSK_API_TOKEN` | Sanctum token per-unit (`php artisan unit:token`) |
| `VITE_UNIT_CODE` | kode unit device ini (mis. `BNB-001`) |
| `VITE_ESP32_BASE_URL` | endpoint ESP32 lokal |
| `VITE_DEBUG_PANEL` | panel debug — **jangan `true` di produksi** |

---

## 12. Testing

**Backend (Pest / PHPUnit):**

```bash
cd backend
php artisan test          # atau: composer test
```

**Frontend (lint + typecheck):**

```bash
cd frontend        # atau frontend-kiosk
npm run lint
npm run build      # tsc -b + vite build (mencakup typecheck)
```

**CV Service (pytest):**

```bash
cd cv-service-fastapi
pytest
```

**Uji ingestion tanpa hardware:** gunakan `php artisan simulate:devices` (lihat [§7](#7-menjalankan-tanpa-hardware-mode-simulasi)) atau `mosquitto_pub` CLI untuk mem-publish pesan MQTT manual.


<sub>Dibuat untuk mendukung program pemilahan & edukasi sampah di sekolah. 🐰🗑️</sub>
