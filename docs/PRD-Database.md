# PRD: BunnyBin Database — PostgreSQL + TimescaleDB

| | |
|---|---|
| **Fokus dokumen** | Skema lengkap, hypertable, index, continuous aggregate, retention policy, dan strategi migration Laravel. |
| **Parent** | `PRD-Webapp-FullStack.md` §5 |
| **Dikonsumsi oleh** | `PRD-Backend-Laravel.md` (semua query), `PRD-Frontend-Admin.md` (bentuk data chart) |
| **Target** | Claude Code — Fase 1 roadmap master PRD |

---

## 1. Prinsip Desain

- **Satu database** untuk relational + time-series. Tabel event (`sort_logs`, `fill_snapshots`) = hypertable TimescaleDB; tabel master = tabel Postgres biasa.
- Semua DDL dijalankan lewat **Laravel migration** — tidak ada SQL manual di luar migration, supaya reproducible via `php artisan migrate:fresh --seed`.
- Statement khusus Timescale (`create_hypertable`, dsb.) dijalankan via `DB::statement()` di dalam migration, dibungkus guard supaya test environment tanpa extension tetap jalan.

---

## 2. Extension & Guard Migration

```php
// migration paling awal: 0000_enable_timescaledb.php
public function up(): void
{
    try {
        DB::statement('CREATE EXTENSION IF NOT EXISTS timescaledb');
    } catch (\Throwable $e) {
        logger()->warning('TimescaleDB extension unavailable, continuing without it');
    }
}
```

Helper untuk migration lain:
```php
private function timescaleAvailable(): bool
{
    return DB::selectOne(
        "SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'"
    ) !== null;
}
```

---

## 3. Tabel Master (Postgres biasa)

Urutan migration mengikuti dependensi FK.

### schools
| Kolom | Tipe | Catatan |
|---|---|---|
| id | bigserial PK | |
| name | varchar(150) NOT NULL | |
| address | text | |
| city / province | varchar(100) | |
| contact_person | varchar(100) | |
| contact_phone | varchar(30) | |
| timestamps | timestamptz | Laravel default |

### units
| Kolom | Tipe | Catatan |
|---|---|---|
| id | bigserial PK | |
| school_id | FK → schools, CASCADE | |
| code | varchar(30) UNIQUE NOT NULL | identifier ESP32, ex `BNB-001` |
| location_label | varchar(100) | |
| status | varchar(20) default 'active' | `active\|maintenance\|offline` — enforce di app layer, bukan DB enum (mudah nambah nilai) |
| last_seen_at | timestamptz nullable | diupdate tiap pesan MQTT |
| installed_at | date nullable | |
| timestamps | | |

**Index:** `units(school_id)`, `units(status)`.

### admin_users
| Kolom | Tipe | Catatan |
|---|---|---|
| id | bigserial PK | |
| school_id | FK → schools, SET NULL, nullable | NULL = super_admin |
| name | varchar(100) | |
| email | varchar(150) UNIQUE | |
| password | varchar(255) | bcrypt via Laravel |
| role | varchar(20) | `super_admin\|school_admin` |
| timestamps | | |

**Constraint aplikasi:** `school_admin` wajib punya `school_id` — validasi di FormRequest, plus DB CHECK opsional:
```sql
CHECK (role = 'super_admin' OR school_id IS NOT NULL)
```

### quiz_items
| Kolom | Tipe |
|---|---|
| id | bigserial PK |
| category | varchar(20) — `organic\|inorganic` |
| item_name | varchar(100) |
| image_url | text nullable |
| explanation | text nullable |
| active | boolean default true |
| timestamps | |

**Index:** `quiz_items(category, active)`.

### maintenance_events
| Kolom | Tipe |
|---|---|
| id | bigserial PK |
| unit_id | FK → units CASCADE |
| event_type | varchar(30) — `jam\|sensor_error\|battery_low\|manual_reset` |
| note | text nullable |
| resolved | boolean default false |
| created_at | timestamptz |

### alerts
| Kolom | Tipe |
|---|---|
| id | bigserial PK |
| unit_id | FK → units CASCADE |
| alert_type | varchar(30) — `fill_70\|fill_90\|offline\|maintenance` |
| message | text |
| is_read | boolean default false |
| created_at | timestamptz |

**Index:** `alerts(unit_id, is_read, created_at)` — query dedup alert engine & inbox.

---

## 4. Hypertable (Time-Series)

### fill_snapshots
```php
Schema::create('fill_snapshots', function (Blueprint $t) {
    $t->bigIncrements('id');
    $t->foreignId('unit_id')->constrained()->cascadeOnDelete();
    $t->smallInteger('organic_pct');
    $t->smallInteger('inorganic_pct');
    $t->timestampTz('recorded_at')->default(DB::raw('now()'));
});
DB::statement('ALTER TABLE fill_snapshots DROP CONSTRAINT fill_snapshots_pkey');
DB::statement('ALTER TABLE fill_snapshots ADD PRIMARY KEY (id, recorded_at)');
if ($this->timescaleAvailable()) {
    DB::statement("SELECT create_hypertable('fill_snapshots', 'recorded_at')");
}
```
> Hypertable mensyaratkan kolom partisi ada di PK/unique constraint — makanya PK composite `(id, recorded_at)`.

**Index tambahan:** `(unit_id, recorded_at DESC)` — query "fill terbaru per unit" dan chart range.

### sort_logs
Pola sama, kolom: `unit_id`, `quiz_item_id` (FK nullable SET NULL), `category_detected varchar(20) nullable`, `confidence real nullable`, `is_correct boolean nullable`, `created_at timestamptz`. PK `(id, created_at)`, hypertable on `created_at`, index `(unit_id, created_at DESC)`.

> **Catatan FK:** FK dari hypertable ke tabel biasa didukung Timescale; FK *menuju* hypertable tidak — jangan pernah buat tabel lain yang mereferensikan `sort_logs`/`fill_snapshots`.

---

## 5. Continuous Aggregate & Retention (Fase Lanjut — buat migration-nya, boleh dijalankan belakangan)

```sql
-- Aggregate per jam untuk chart range panjang
CREATE MATERIALIZED VIEW fill_hourly
WITH (timescaledb.continuous) AS
SELECT unit_id,
       time_bucket('1 hour', recorded_at) AS bucket,
       avg(organic_pct)::smallint  AS avg_organic,
       avg(inorganic_pct)::smallint AS avg_inorganic,
       max(organic_pct)  AS max_organic,
       max(inorganic_pct) AS max_inorganic
FROM fill_snapshots
GROUP BY unit_id, bucket;

SELECT add_continuous_aggregate_policy('fill_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset   => INTERVAL '30 minutes',
  schedule_interval => INTERVAL '30 minutes');

-- Retention raw 90 hari (aggregate tetap tersimpan)
SELECT add_retention_policy('fill_snapshots', INTERVAL '90 days');
```
Endpoint `fill-history?interval=hourly` membaca `fill_hourly`, `interval=raw` membaca hypertable langsung (max 31 hari).

---

## 6. Query Pattern Penting (referensi untuk BE)

**Fill terbaru per unit (dashboard):**
```sql
SELECT DISTINCT ON (unit_id) unit_id, organic_pct, inorganic_pct, recorded_at
FROM fill_snapshots
WHERE unit_id = ANY(:ids)
ORDER BY unit_id, recorded_at DESC;
```

**Akurasi sortir 7 hari:**
```sql
SELECT count(*) FILTER (WHERE is_correct)::float / NULLIF(count(*), 0)
FROM sort_logs
WHERE created_at > now() - interval '7 days'
  AND is_correct IS NOT NULL
  AND unit_id IN (SELECT id FROM units WHERE school_id = :sid);
```

---

## 7. Definisi Selesai

- `php artisan migrate:fresh --seed` sukses di container dengan image `timescale/timescaledb:latest-pg15`.
- `SELECT * FROM timescaledb_information.hypertables` menampilkan `fill_snapshots` & `sort_logs`.
- Migration yang sama sukses juga di Postgres polos (CI/test) — guard bekerja.
- Seeder menghasilkan data sesuai `PRD-Backend-Laravel.md` §6.
