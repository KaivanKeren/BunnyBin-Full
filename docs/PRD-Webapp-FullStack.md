# PRD: BunnyBin Web App — Full Prototype (FE + BE Laravel/FastAPI + DB)

| | |
|---|---|
| **Fokus dokumen** | Spesifikasi implementasi penuh untuk web app BunnyBin: Frontend (Admin Dashboard), Backend (Laravel + FastAPI), dan Database (PostgreSQL/TimescaleDB). Ditulis untuk dieksekusi langsung oleh Claude Code. |
| **Status** | Draft 1.0 |
| **Audiens** | Claude Code (implementation agent), developer |
| **Dokumen terkait** | `PRD.md` (produk/riset/SDG), `PRD-Software-CV.md` (integrasi CV+hardware), `PRD-Frontend-Prototype.md` (kiosk UI mock-first) |
| **Asumsi ruang lingkup** | Dokumen ini fokus ke **Admin/Monitoring Dashboard** (web app untuk sekolah & pengelola memantau bin, lihat log sortir, kelola quiz bank) — bukan kiosk UI on-device di trash bin, yang sudah punya PRD terpisah. Backend di sini adalah backend yang sama yang juga melayani kiosk. |

---

## 1. Tujuan & Non-Tujuan

**Tujuan:**
- Web app admin untuk memantau status bin real-time (fill level organik/anorganik) di banyak sekolah.
- Riwayat log sortir & akurasi klasifikasi per bin.
- Manajemen quiz bank (soal edukasi yang muncul di kiosk).
- Manajemen sekolah & unit bin (multi-tenant per sekolah).
- Alert otomatis saat bin penuh (70%/90%) atau unit offline.
- Backend menerima data sensor dari ESP32 via MQTT dan menyimpannya sebagai time-series.
- Backend menyediakan endpoint klasifikasi sampah (proxy ke CV service Python).

**Non-Tujuan (di luar scope dokumen ini):**
- Kiosk UI di layar trash bin — sudah dicover `PRD-Frontend-Prototype.md`.
- Training model CV — dicover `PRD-Software-CV.md`. Dokumen ini hanya mendefinisikan *interface* ke CV service.
- Firmware ESP32 — di luar scope software web.

---

## 2. Arsitektur Sistem

```
                                   ┌─────────────────────────┐
                                   │   Kiosk UI (per bin)     │
                                   │   React/Vite (repo lain) │
                                   └───────────┬──────────────┘
                                               │ REST (auth token unit)
                                               ▼
┌──────────────┐   MQTT    ┌─────────────────────────────────────────┐
│  ESP32 (bin)  │──────────▶│           Mosquitto Broker              │
└──────────────┘           └───────────────────┬─────────────────────┘
                                                │ subscribe bunnybin/+/#
                                                ▼
                                ┌───────────────────────────────┐
                                │  Laravel App (BE utama)       │
                                │  - REST API (Sanctum auth)    │
                                │  - MQTT Listener (queue job)  │
                                │  - Alert engine               │
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
                        │ - login sekolah/super admin    │
                        │ - monitoring, quiz, alert       │
                        └───────────────────────────────┘
```

**Prinsip kunci:**
- Laravel adalah satu-satunya *source of truth* untuk data relational dan satu-satunya yang bicara ke database.
- FastAPI CV service **stateless** — tidak pernah menyentuh database, hanya menerima gambar dan mengembalikan hasil klasifikasi ke Laravel.
- Kiosk UI dan Admin Dashboard adalah dua frontend terpisah, sama-sama konsumen REST API Laravel.
- ESP32 tidak pernah panggil FastAPI langsung — semua lewat Laravel sebagai orchestrator.

---

## 3. Tech Stack

| Layer | Pilihan | Alasan |
|---|---|---|
| Backend utama | Laravel 11 + Sanctum | CRUD, auth, dashboard API, MQTT ingestion via queue worker |
| CV service | FastAPI + Python 3.11 | Ekosistem ML/CV (OpenCV/YOLO), dipanggil internal oleh Laravel |
| Database | PostgreSQL 15 + TimescaleDB extension | Relational + time-series dalam satu database |
| Message broker | Eclipse Mosquitto | Ingestion sensor dari ESP32, ringan untuk device IoT |
| Object storage | MinIO (self-hosted, S3-compatible) | Simpan gambar sampah untuk audit/retraining CV, bukan di Postgres |
| Frontend admin | React + TypeScript + Vite | Konsisten dgn kiosk UI, ringan, tanpa perlu SSR |
| Styling FE | Tailwind CSS | Cepat, konsisten dgn proyek lain |
| Reverse proxy | Nginx | Routing publik ke Laravel & static FE, FastAPI tetap internal-only |
| Container | Docker Compose | Semua service jalan sebagai container, mudah direplikasi di VPS |

---

## 4. Struktur Repo (Monorepo)

```
bunnybin-webapp/
├── backend-laravel/
│   ├── app/
│   │   ├── Http/Controllers/Api/
│   │   │   ├── AuthController.php
│   │   │   ├── SchoolController.php
│   │   │   ├── UnitController.php
│   │   │   ├── QuizItemController.php
│   │   │   ├── SortLogController.php
│   │   │   ├── AlertController.php
│   │   │   └── DashboardController.php
│   │   ├── Models/
│   │   │   ├── School.php
│   │   │   ├── Unit.php
│   │   │   ├── AdminUser.php
│   │   │   ├── QuizItem.php
│   │   │   ├── SortLog.php
│   │   │   ├── FillSnapshot.php
│   │   │   ├── MaintenanceEvent.php
│   │   │   └── Alert.php
│   │   ├── Console/Commands/MqttListen.php
│   │   ├── Jobs/ProcessSensorReading.php
│   │   ├── Services/CvClientService.php
│   │   └── Services/AlertEngineService.php
│   ├── database/migrations/
│   ├── routes/api.php
│   ├── config/services.php     # config endpoint FastAPI CV
│   └── .env.example
├── cv-service-fastapi/
│   ├── app/
│   │   ├── main.py
│   │   ├── schemas.py
│   │   └── model/              # weight file / inference logic
│   ├── requirements.txt
│   └── .env.example
├── frontend-admin/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── DashboardOverview.tsx
│   │   │   ├── UnitDetail.tsx
│   │   │   ├── SortLogs.tsx
│   │   │   ├── Alerts.tsx
│   │   │   ├── QuizManagement.tsx
│   │   │   └── SchoolUnitManagement.tsx
│   │   ├── api/client.ts       # axios instance + Sanctum handling
│   │   ├── api/contracts.ts    # TypeScript types, sinkron dgn Laravel API resource
│   │   └── components/
│   ├── package.json
│   └── .env.example
├── mosquitto/
│   └── mosquitto.conf
├── docker-compose.yml
└── README.md
```

---

## 5. Skema Database

Semua tabel di bawah dibuat via Laravel migration. Tabel `sort_logs` dan `fill_snapshots` dikonversi jadi **hypertable** TimescaleDB (time-series, partisi otomatis by waktu).

```sql
-- schools
CREATE TABLE schools (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    province VARCHAR(100),
    contact_person VARCHAR(100),
    contact_phone VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- units (satu bin fisik)
CREATE TABLE units (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    code VARCHAR(30) UNIQUE NOT NULL,        -- serial/identifier ESP32, ex: BNB-001
    location_label VARCHAR(100),             -- "Kelas 3A", "Kantin"
    status VARCHAR(20) DEFAULT 'active',     -- active | maintenance | offline
    last_seen_at TIMESTAMPTZ,
    installed_at DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- admin_users
CREATE TABLE admin_users (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE SET NULL, -- NULL = super_admin
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,               -- super_admin | school_admin
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- quiz_items (bank soal edukasi, dikelola super_admin)
CREATE TABLE quiz_items (
    id BIGSERIAL PRIMARY KEY,
    category VARCHAR(20) NOT NULL,           -- organic | inorganic
    item_name VARCHAR(100) NOT NULL,
    image_url TEXT,
    explanation TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- sort_logs (time-series: setiap event sortir)
CREATE TABLE sort_logs (
    id BIGSERIAL,
    unit_id BIGINT REFERENCES units(id) ON DELETE CASCADE,
    quiz_item_id BIGINT REFERENCES quiz_items(id) ON DELETE SET NULL,
    category_detected VARCHAR(20),           -- hasil CV
    confidence REAL,
    is_correct BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
);
SELECT create_hypertable('sort_logs', 'created_at');

-- fill_snapshots (time-series: sensor reading berkala)
CREATE TABLE fill_snapshots (
    id BIGSERIAL,
    unit_id BIGINT REFERENCES units(id) ON DELETE CASCADE,
    organic_pct SMALLINT,
    inorganic_pct SMALLINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id, recorded_at)
);
SELECT create_hypertable('fill_snapshots', 'recorded_at');

-- maintenance_events
CREATE TABLE maintenance_events (
    id BIGSERIAL PRIMARY KEY,
    unit_id BIGINT REFERENCES units(id) ON DELETE CASCADE,
    event_type VARCHAR(30),                  -- jam | sensor_error | battery_low | manual_reset
    note TEXT,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- alerts
CREATE TABLE alerts (
    id BIGSERIAL PRIMARY KEY,
    unit_id BIGINT REFERENCES units(id) ON DELETE CASCADE,
    alert_type VARCHAR(30),                  -- fill_70 | fill_90 | offline | maintenance
    message TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Retention/downsampling (opsional, Fase lanjut):** continuous aggregate TimescaleDB untuk `fill_snapshots` per jam, retention policy raw data 90 hari.

---

## 6. Kontrak API — Laravel REST

Base URL: `/api`. Auth: Laravel Sanctum (SPA token via cookie, CORS domain FE di-whitelist).

| Method | Endpoint | Deskripsi | Role |
|---|---|---|---|
| POST | `/auth/login` | Login admin (email+password) | public |
| POST | `/auth/logout` | Logout | authenticated |
| GET | `/auth/me` | Profil admin login | authenticated |
| GET | `/schools` | List sekolah | super_admin |
| POST | `/schools` | Tambah sekolah | super_admin |
| GET/PUT/DELETE | `/schools/{id}` | Detail/update/hapus sekolah | super_admin |
| GET | `/units` | List unit (scoped ke sekolah admin login) | all roles |
| POST | `/units` | Tambah unit | super_admin |
| GET | `/units/{id}` | Detail unit + status terkini | all roles |
| PUT/DELETE | `/units/{id}` | Update/hapus unit | super_admin |
| GET | `/units/{id}/fill-history` | Time-series fill level (query range) | all roles |
| GET | `/units/{id}/sort-logs` | Riwayat sortir (paginated) | all roles |
| GET | `/quiz-items` | List quiz bank | all roles |
| POST/PUT/DELETE | `/quiz-items/{id}` | CRUD quiz item | super_admin |
| GET | `/dashboard/summary` | Aggregate: total unit aktif, avg fill, alert belum dibaca | all roles |
| GET | `/alerts` | List alert (scoped) | all roles |
| PATCH | `/alerts/{id}/read` | Tandai alert dibaca | all roles |
| POST | `/cv/classify` | Proxy ke FastAPI, terima gambar → hasil klasifikasi | internal (dipanggil dari device/kiosk) |

**Response contract contoh (`GET /units/{id}`):**
```json
{
  "id": 1,
  "code": "BNB-001",
  "school": { "id": 3, "name": "SDN 1 Kudus" },
  "location_label": "Kelas 3A",
  "status": "active",
  "last_seen_at": "2026-07-07T08:12:00Z",
  "latest_fill": { "organic_pct": 42, "inorganic_pct": 68, "recorded_at": "2026-07-07T08:10:00Z" }
}
```

---

## 7. Kontrak API — FastAPI CV Service (internal only)

Tidak diekspos ke publik, hanya dipanggil dari Laravel via Docker internal network.

```python
# schemas.py
class ClassifyRequest(BaseModel):
    image_base64: str

class ClassifyResponse(BaseModel):
    category: Literal["organic", "inorganic"] | None
    confidence: float
    bbox: tuple[int, int, int, int] | None
```

`POST http://cv-service:8000/classify` → dipanggil dari `CvClientService.php` di Laravel via Guzzle/HTTP facade.

---

## 8. Ingestion MQTT (ESP32 → Laravel)

**Topik:**
- `bunnybin/{unit_code}/sensor` → `{"organic_pct": 42, "inorganic_pct": 68, "ts": "..."}`
- `bunnybin/{unit_code}/sort` → `{"category": "organic", "ts": "..."}`
- `bunnybin/{unit_code}/heartbeat` → `{"status": "online", "ts": "..."}`
- `bunnybin/{unit_code}/cmd` (arah Laravel → ESP32, opsional untuk command jarak jauh)

**Alur:**
1. `php artisan mqtt:listen` (Laravel Artisan command, jalan sebagai container terpisah/supervisor) subscribe `bunnybin/+/#`.
2. Setiap pesan masuk → dispatch job `ProcessSensorReading` ke queue (Redis/database queue driver).
3. Job parse `unit_code` dari topik, cari `unit_id`, insert ke `fill_snapshots`/`sort_logs`, update `units.last_seen_at`.
4. `AlertEngineService` cek threshold (≥70% → `fill_70`, ≥90% → `fill_90`) dan buat baris di `alerts` jika belum ada alert sejenis yang belum dibaca dalam 1 jam terakhir (hindari spam).
5. Jika `last_seen_at` tidak update >15 menit → scheduled job (Laravel scheduler, tiap 5 menit) tandai unit `offline` + buat alert.

---

## 9. RBAC

| Role | Akses |
|---|---|
| `super_admin` | Semua sekolah, semua unit, kelola quiz bank, kelola akun admin sekolah |
| `school_admin` | Hanya unit & data milik `school_id` miliknya, tidak bisa edit quiz bank |

Middleware Laravel: `EnsureSchoolScope` — otomatis filter query berdasarkan `school_id` dari user login kecuali role `super_admin`.

---

## 10. Frontend Admin — Halaman

| Halaman | Fungsi |
|---|---|
| `Login` | Auth via Sanctum |
| `DashboardOverview` | Ringkasan semua unit (card fill level, status online/offline), alert terbaru |
| `UnitDetail` | Chart riwayat fill level (recharts), tabel sort log, maintenance event |
| `SortLogs` | Tabel riwayat sortir, filter tanggal/unit, akurasi klasifikasi |
| `Alerts` | Inbox alert, mark as read |
| `QuizManagement` | CRUD quiz bank (super_admin only) |
| `SchoolUnitManagement` | CRUD sekolah & unit (super_admin only) |

State/data fetching: React Query (TanStack Query) untuk caching & polling status unit (interval polling 15–30 detik cukup, tidak perlu WebSocket di MVP).

---

## 11. Docker Compose (kerangka)

```yaml
services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_DB: bunnybin
      POSTGRES_USER: bunnybin
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: [pgdata:/var/lib/postgresql/data]

  mosquitto:
    image: eclipse-mosquitto
    volumes: [./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf]
    ports: ["1883:1883"]

  laravel-app:
    build: ./backend-laravel
    depends_on: [postgres, mosquitto]
    env_file: ./backend-laravel/.env

  laravel-mqtt-worker:
    build: ./backend-laravel
    command: php artisan mqtt:listen
    depends_on: [laravel-app, mosquitto]

  cv-service:
    build: ./cv-service-fastapi
    expose: ["8000"]     # internal only, tidak di-publish ke host

  frontend-admin:
    build: ./frontend-admin
    depends_on: [laravel-app]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    depends_on: [laravel-app, frontend-admin]

volumes:
  pgdata:
```

---

## 12. Roadmap Implementasi (untuk Claude Code)

| Fase | Task | Output |
|---|---|---|
| 1 | Setup Laravel project + migration semua tabel §5 | Skema DB jalan, `php artisan migrate` sukses |
| 2 | Auth Sanctum + RBAC middleware + seeder (1 super_admin, 1 sekolah contoh) | Login API berfungsi |
| 3 | CRUD endpoint School/Unit/QuizItem (§6) | Semua endpoint CRUD ter-test (bisa pakai Postman/Pest) |
| 4 | MQTT listener + job ingestion + alert engine (§8) | Simulasi publish MQTT → data masuk ke `fill_snapshots`, alert muncul saat >70% |
| 5 | FastAPI CV service skeleton (`/classify` return dummy response dulu) + integrasi `CvClientService` di Laravel | Endpoint `/api/cv/classify` proxy sukses |
| 6 | Frontend admin: Login + DashboardOverview + UnitDetail (pakai data asli dari API, bukan mock) | Dashboard bisa login & tampilkan data unit real |
| 7 | Frontend admin: SortLogs, Alerts, QuizManagement, SchoolUnitManagement | Semua halaman §10 selesai |
| 8 | Docker Compose full stack + Nginx reverse proxy | `docker compose up` menjalankan seluruh sistem end-to-end |

**Catatan untuk Claude Code:** kerjakan fase secara berurutan, tiap fase harus bisa di-*test* independen sebelum lanjut ke fase berikutnya (migration jalan → auth jalan → CRUD jalan → ingestion jalan → dst). Gunakan Laravel Pest/PHPUnit untuk test endpoint API, dan simulasikan publish MQTT via `mosquitto_pub` CLI untuk test ingestion tanpa hardware asli.

---

## 13. Open Questions

- Apakah `school_admin` boleh mengusulkan quiz item baru (butuh approval `super_admin`) atau benar-benar read-only ke quiz bank?
- Apakah gambar hasil deteksi CV perlu disimpan (untuk retraining) — jika ya, tambahkan integrasi MinIO di Fase 5.
- Apakah perlu notifikasi push/email saat alert `fill_90` dibuat, atau cukup tampil di dashboard?
