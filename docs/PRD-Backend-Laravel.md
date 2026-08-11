# PRD: BunnyBin Backend — Laravel API & MQTT Ingestion

| | |
|---|---|
| **Fokus dokumen** | Implementasi detail backend utama: REST API, auth Sanctum, RBAC, MQTT ingestion, alert engine, integrasi CV service. |
| **Parent** | `PRD-Webapp-FullStack.md` §6, §8, §9 |
| **Dependensi** | `PRD-Database.md` (skema harus sudah migrate), `PRD-CV-Service-FastAPI.md` (kontrak /classify) |
| **Target** | Claude Code — Fase 1–5 roadmap master PRD |

---

## 1. Setup Project

```bash
composer create-project laravel/laravel backend-laravel
cd backend-laravel
composer require laravel/sanctum php-mqtt/laravel-client
php artisan install:api
```

**Package wajib:**
- `laravel/sanctum` — SPA auth (cookie-based) untuk admin dashboard.
- `php-mqtt/laravel-client` — MQTT subscribe/publish.
- `pestphp/pest` — testing (sudah default Laravel 11).

**.env kunci:**
```env
DB_CONNECTION=pgsql
DB_HOST=postgres
DB_DATABASE=bunnybin
MQTT_HOST=mosquitto
MQTT_PORT=1883
CV_SERVICE_URL=http://cv-service:8000
SANCTUM_STATEFUL_DOMAINS=admin.bunnybin.local,localhost:5173
SESSION_DOMAIN=.bunnybin.local
FRONTEND_URL=http://localhost:5173
QUEUE_CONNECTION=database
```

---

## 2. Auth & RBAC

### 2.1 Model AdminUser
Gunakan tabel `admin_users` (bukan `users` default) — update `config/auth.php` provider ke model `AdminUser`. Model implement `Authenticatable`, `HasApiTokens`.

### 2.2 Endpoint Auth
| Method | Route | Behavior |
|---|---|---|
| POST | `/api/auth/login` | Validasi email+password, regenerate session, return profil |
| POST | `/api/auth/logout` | Invalidate session |
| GET | `/api/auth/me` | Return `{id, name, email, role, school: {id, name} \| null}` |

### 2.3 Middleware
```php
// app/Http/Middleware/EnsureSchoolScope.php
// Inject school_id constraint ke request untuk role school_admin.
// super_admin: bypass.
// Digunakan bersama query scope di model:

// app/Models/Concerns/BelongsToSchoolScope.php (trait)
public function scopeForUser(Builder $q, AdminUser $user): Builder
{
    return $user->role === 'super_admin'
        ? $q
        : $q->where('school_id', $user->school_id);
}
```

Route group:
```php
Route::middleware(['auth:sanctum'])->group(function () {
    // semua route non-auth
    Route::middleware('role:super_admin')->group(function () {
        // schools CRUD, units create/update/delete, quiz CRUD
    });
});
```

`role` middleware sederhana: cek `$request->user()->role` terhadap parameter.

---

## 3. Controller & Validasi

Semua controller di `app/Http/Controllers/Api/`, response via **API Resource** (`app/Http/Resources/`) supaya bentuk JSON konsisten dengan kontrak §6 master PRD.

### 3.1 UnitController
```php
index()   // Unit::forUser($user)->with('school')->withLatestFill()->paginate()
show()    // + latest_fill via subquery fill_snapshots terbaru
store()   // validasi: code unique, school_id exists — super_admin only
update()  // status: in:active,maintenance,offline
destroy()

fillHistory(Request $r, Unit $unit)
// GET /units/{id}/fill-history?from=...&to=...&interval=raw|hourly
// raw: SELECT * FROM fill_snapshots WHERE unit_id=? AND recorded_at BETWEEN
// hourly: pakai time_bucket('1 hour', recorded_at) TimescaleDB, avg pct
// Batasi range max 31 hari untuk raw, 1 tahun untuk hourly.

sortLogs(Request $r, Unit $unit)
// paginated, filter ?is_correct=&from=&to=
```

`withLatestFill()` — local scope pakai `addSelect` subquery atau lateral join, JANGAN N+1.

### 3.2 QuizItemController
CRUD standar. `image_url` untuk MVP berupa URL eksternal/path statis (upload file ke MinIO = fase lanjut, lihat Open Question master PRD).

### 3.3 DashboardController
```php
summary()
// {
//   total_units, units_online, units_offline,
//   avg_organic_pct, avg_inorganic_pct,   // dari fill terbaru tiap unit
//   unread_alerts,
//   sort_accuracy_7d                       // % is_correct 7 hari terakhir
// }
// Semua scoped forUser(). Gunakan satu query per metrik, cache 30 detik.
```

### 3.4 AlertController
`index()` paginated + filter `?unread=1`; `markRead(Alert $alert)` PATCH.

### 3.5 CvProxyController
```php
POST /api/cv/classify
// Body: multipart image ATAU {image_base64}
// Delegasi ke CvClientService, return response FastAPI apa adanya + simpan
// hasil ke sort_logs JIKA request menyertakan unit_code + quiz_item_id.
// Auth: token unit (Sanctum token per-unit, ability 'kiosk') — BUKAN session admin.
```

---

## 4. Service Layer

### 4.1 CvClientService
```php
// app/Services/CvClientService.php
public function classify(string $imageBase64): CvResult
{
    $resp = Http::timeout(10)
        ->retry(2, 500)
        ->post(config('services.cv.url').'/classify', [
            'image_base64' => $imageBase64,
        ]);

    if ($resp->failed()) {
        throw new CvServiceUnavailableException();
    }
    return CvResult::fromArray($resp->json());
}
```
`CvResult` = readonly DTO `{?string category, float confidence, ?array bbox}`.
Jika CV service down → response 503 dengan `{error: "cv_unavailable"}`; kiosk fallback ke mode quiz manual (di luar scope BE).

### 4.2 AlertEngineService
```php
public function evaluateFill(Unit $unit, int $organicPct, int $inorganicPct): void
// Untuk tiap kompartemen:
//   pct >= 90 → tipe fill_90; elseif pct >= 70 → fill_70
// Dedup: skip jika ada alert unit_id+alert_type is_read=false created_at > now()-1h
public function evaluateOffline(Unit $unit): void
// dipanggil scheduler — last_seen_at < now()-15m && status != offline
//   → set status offline + alert 'offline'
```

---

## 5. MQTT Ingestion

### 5.1 Command
```php
// app/Console/Commands/MqttListen.php
// php artisan mqtt:listen
$mqtt->subscribe('bunnybin/+/#', function (string $topic, string $message) {
    [, $unitCode, $channel] = explode('/', $topic);
    ProcessSensorReading::dispatch($unitCode, $channel, json_decode($message, true));
});
$mqtt->loop(true);
```
Jalankan sebagai container terpisah (lihat `PRD-Infrastructure-Deployment.md`). Wajib handle reconnect: wrap loop dalam try/catch + sleep + reconnect.

### 5.2 Job ProcessSensorReading
```php
// payload channel 'sensor'   → insert fill_snapshots + AlertEngine::evaluateFill
// payload channel 'sort'     → insert sort_logs (tanpa quiz_item, is_correct null
//                              jika sortir dari CV device-side)
// payload channel 'heartbeat'→ update units.last_seen_at, status=active jika offline
// unit_code tidak ditemukan  → log warning, JANGAN throw (hindari retry loop)
// Validasi payload: pct 0-100, category in:organic,inorganic. Payload invalid → log & skip.
```
Selalu `updated_at`/`last_seen_at` di-touch pada pesan apa pun dari unit tsb.

### 5.3 Scheduler
```php
// routes/console.php
Schedule::call(fn () => app(AlertEngineService::class)->sweepOffline())
    ->everyFiveMinutes();
```

---

## 6. Seeder

`DatabaseSeeder`:
- 1 super_admin (`admin@bunnybin.id` / password dari env `SEED_ADMIN_PASSWORD`)
- 1 sekolah contoh "SDN 1 Kudus" + 1 school_admin
- 2 unit (`BNB-001`, `BNB-002`)
- 10 quiz item (5 organic, 5 inorganic)
- 48 jam `fill_snapshots` dummy per unit (interval 30 menit, tren naik) — supaya chart FE langsung ada isinya
- 50 `sort_logs` dummy

---

## 7. Testing (Pest)

Minimal test wajib per fase:
```
tests/Feature/AuthTest.php            login sukses/gagal, me, logout
tests/Feature/SchoolScopeTest.php     school_admin TIDAK bisa lihat unit sekolah lain (paling kritis)
tests/Feature/UnitCrudTest.php        CRUD + fill-history hourly bucket
tests/Feature/QuizRbacTest.php        school_admin ditolak POST /quiz-items (403)
tests/Feature/IngestionTest.php       dispatch job manual → row masuk, alert 70/90 terbuat, dedup jalan
tests/Feature/CvProxyTest.php         Http::fake FastAPI, sukses & 503 path
```
Test DB: gunakan `RefreshDatabase`; hypertable di test environment boleh dilewati (guard `create_hypertable` dengan try/catch di migration atau cek extension).

---

## 8. Definisi Selesai

- Semua endpoint §3 hijau di Pest.
- `mosquitto_pub -t bunnybin/BNB-001/sensor -m '{"organic_pct":75,"inorganic_pct":30}'` → row `fill_snapshots` baru + alert `fill_70` muncul di `GET /api/alerts`.
- `php artisan schedule:run` menandai unit yang last_seen >15 menit sebagai offline.
