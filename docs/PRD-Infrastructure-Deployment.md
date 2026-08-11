# PRD: BunnyBin Infrastructure — Docker, Nginx, Mosquitto & Deployment

| | |
|---|---|
| **Fokus dokumen** | Orkestrasi seluruh service via Docker Compose, konfigurasi Mosquitto & Nginx, environment, dan jalur deployment ke VPS. |
| **Parent** | `PRD-Webapp-FullStack.md` §11 |
| **Dependensi** | Semua PRD komponen (Laravel, FastAPI, DB, FE Admin) |
| **Target** | Claude Code — Fase 8 roadmap master PRD |

---

## 1. Topologi

```
Internet ──▶ :80/:443 Nginx ──┬─▶ /api, /sanctum ──▶ laravel-app:9000 (php-fpm)
                              └─▶ /               ──▶ static build frontend-admin

ESP32 ────▶ :1883 Mosquitto ◀── laravel-mqtt-worker (subscribe)

Internal-only (Docker network `bunnybin-net`, tidak ada port host):
  cv-service:8000, postgres:5432, redis:6379 (opsional)
```
Hanya tiga port yang terekspos ke host: **80, 443, 1883**. Postgres/FastAPI tidak pernah publik.

---

## 2. docker-compose.yml (lengkap)

```yaml
name: bunnybin

services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_DB: ${DB_DATABASE:-bunnybin}
      POSTGRES_USER: ${DB_USERNAME:-bunnybin}
      POSTGRES_PASSWORD: ${DB_PASSWORD:?required}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USERNAME:-bunnybin}"]
      interval: 10s
      retries: 5
    networks: [bunnybin-net]

  mosquitto:
    image: eclipse-mosquitto:2
    ports: ["1883:1883"]
    volumes:
      - ./mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
      - ./mosquitto/passwd:/mosquitto/config/passwd:ro
      - mosquitto-data:/mosquitto/data
    networks: [bunnybin-net]

  laravel-app:
    build: ./backend-laravel
    env_file: ./backend-laravel/.env
    depends_on:
      postgres: { condition: service_healthy }
    networks: [bunnybin-net]

  laravel-queue:
    build: ./backend-laravel
    command: php artisan queue:work --tries=3 --backoff=5
    env_file: ./backend-laravel/.env
    depends_on: [laravel-app]
    restart: unless-stopped
    networks: [bunnybin-net]

  laravel-mqtt-worker:
    build: ./backend-laravel
    command: php artisan mqtt:listen
    env_file: ./backend-laravel/.env
    depends_on: [laravel-app, mosquitto]
    restart: unless-stopped
    networks: [bunnybin-net]

  laravel-scheduler:
    build: ./backend-laravel
    command: sh -c "while true; do php artisan schedule:run; sleep 60; done"
    env_file: ./backend-laravel/.env
    depends_on: [laravel-app]
    restart: unless-stopped
    networks: [bunnybin-net]

  cv-service:
    build: ./cv-service-fastapi
    environment:
      CV_MODE: ${CV_MODE:-dummy}
    expose: ["8000"]
    volumes:
      - ./cv-service-fastapi/model:/model:ro
    networks: [bunnybin-net]

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - frontend-dist:/usr/share/nginx/html:ro
      - ./backend-laravel/public:/var/www/public:ro
      - certbot-certs:/etc/letsencrypt:ro
    depends_on: [laravel-app]
    networks: [bunnybin-net]

  frontend-build:
    build: ./frontend-admin
    command: sh -c "cp -r /app/dist/* /out/"
    volumes:
      - frontend-dist:/out
    profiles: [build]

networks:
  bunnybin-net:

volumes:
  pgdata:
  mosquitto-data:
  frontend-dist:
  certbot-certs:
```

**Catatan:**
- 4 container dari satu image Laravel (app/queue/mqtt/scheduler) — image sama, command beda. Ini pola yang sama seperti deploy absensi-plus.
- `frontend-build` pakai profile `build`: jalankan sekali `docker compose --profile build up frontend-build` tiap release FE untuk mengisi volume `frontend-dist`.
- Redis opsional: MVP pakai `QUEUE_CONNECTION=database`. Kalau volume pesan naik → tambah service redis + ganti env.

---

## 3. Mosquitto

```conf
# mosquitto/mosquitto.conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
persistence true
persistence_location /mosquitto/data/
```

Buat kredensial:
```bash
docker compose exec mosquitto mosquitto_passwd -c /mosquitto/config/passwd bunnybin-device
docker compose exec mosquitto mosquitto_passwd    /mosquitto/config/passwd laravel-worker
```
- Satu kredensial `bunnybin-device` dipakai semua ESP32 (MVP); per-device credential = fase lanjut.
- **ACL (fase lanjut):** device hanya boleh publish `bunnybin/{code}/#`, worker boleh subscribe `bunnybin/+/#`.
- Untuk produksi lintas internet, tambah listener 8883 TLS — MVP dalam LAN sekolah cukup 1883.

---

## 4. Nginx

```nginx
# nginx/default.conf
server {
    listen 80;
    server_name _;

    # Frontend admin (SPA)
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Laravel via php-fpm
    location ~ ^/(api|sanctum|storage) {
        root /var/www/public;
        try_files $uri /index.php?$query_string;
        location ~ \.php$ {
            fastcgi_pass laravel-app:9000;
            fastcgi_index index.php;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME /var/www/public/index.php;
        }
    }

    client_max_body_size 10m;   # upload gambar klasifikasi
}
```
- FastAPI **tidak punya** location block — memang tidak boleh dijangkau publik.
- HTTPS: certbot + server block 443 ditambahkan saat deploy VPS dengan domain (pola yang sama dengan setup absensi-plus).

---

## 5. Dockerfile Laravel

```dockerfile
FROM php:8.3-fpm-alpine
RUN apk add --no-cache postgresql-dev \
 && docker-php-ext-install pdo_pgsql pcntl
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader
COPY . .
RUN composer dump-autoload --optimize \
 && php artisan config:cache || true
CMD ["php-fpm"]
```
`pcntl` diperlukan `queue:work` graceful shutdown.

---

## 6. Environment & Secrets

- Root `.env` (untuk compose): `DB_PASSWORD`, `CV_MODE`.
- `backend-laravel/.env`: lihat `PRD-Backend-Laravel.md` §1 — host service pakai nama container (`postgres`, `mosquitto`, `cv-service`).
- **Tidak ada secret di git** — sediakan `.env.example` di tiap komponen; README menjelaskan langkah copy.

---

## 7. Bootstrapping (urutan pertama kali)

```bash
cp .env.example .env && cp backend-laravel/.env.example backend-laravel/.env
docker compose up -d postgres mosquitto
# buat kredensial mosquitto (lihat §3)
docker compose up -d laravel-app
docker compose exec laravel-app php artisan key:generate
docker compose exec laravel-app php artisan migrate --seed
docker compose --profile build up frontend-build
docker compose up -d
```
Smoke test:
```bash
curl -s localhost/api/auth/me            # 401 → API hidup
mosquitto_pub -h localhost -u bunnybin-device -P <pass> \
  -t bunnybin/BNB-001/sensor -m '{"organic_pct":75,"inorganic_pct":30}'
# → cek GET /api/alerts memunculkan fill_70
```

---

## 8. CI/CD (GitHub Actions — fase lanjut, kerangka)

- **ci.yml** (tiap PR): job paralel — Pest (service container Postgres polos, guard Timescale aktif), pytest CV service, `npm run build` + `tsc --noEmit` FE.
- **deploy.yml** (tag/main): build & push image ke GHCR → SSH ke VPS → `docker compose pull && docker compose up -d` → `php artisan migrate --force`. Pola identik dengan pipeline absensi-plus yang sudah jalan.

---

## 9. Definisi Selesai

- `docker compose up -d` dari clone bersih + langkah §7 → seluruh smoke test lulus.
- Restart VPS → semua service auto-recover (`restart: unless-stopped`), worker MQTT reconnect sendiri.
- Port scan host: hanya 80/443/1883 terbuka.
- ESP32 fisik di LAN yang sama bisa publish dan datanya muncul di dashboard ≤30 detik.
