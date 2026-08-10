# Analisis Menyeluruh Proyek Binexa

**Tanggal analisis:** 6 Agustus 2026
**Cakupan:** `backend/` (Laravel 12), `frontend/` (admin React), `frontend-kiosk/` (kiosk React), `cv-service-fastapi/`, `BunnyBin_ESP32.ino`, `docker/`, konfigurasi repositori
**Commit dasar:** `182e422` (`main`, working tree bersih)

---

## Ringkasan Eksekutif

Fondasi proyek ini kuat: pemisahan concern jelas (satu `DeviceIngestService` untuk dua pintu masuk), 76 test backend hijau, 20 test CV service hijau, typecheck bersih di kedua frontend, dan komentar kode yang menjelaskan *kenapa* — bukan sekadar *apa*. Masalahnya bukan kekacauan struktural, melainkan **lubang di batas kepercayaan (trust boundary)** dan **kesenjangan antara "berjalan saat demo" dan "berjalan di sekolah"**.

| Level | Jumlah | Inti masalah |
|---|---|---|
| 🔴 **P0 Kritis** | 4 | Kredensial ter-commit, ingest MQTT tanpa autentikasi, token kiosk permanen di bundle publik, login tanpa rate limit |
| 🟠 **P1 Tinggi** | 8 | Batas otorisasi tak ditegakkan, firmware menyembunyikan kegagalan sensor, logika sortir inti salah, kehilangan data, tidak ada jalur produksi |
| 🟡 **P2 Sedang** | 13 | Data device dipercaya berlebihan, duplikasi logika, celah pengujian, layanan internal terbuka |
| ⚪ **P3 Sepele** | 14 | Dokumentasi tak konsisten, sisa debug, bloat repo, penamaan campur |

**Tiga hal yang harus dikerjakan lebih dulu:** ganti password WiFi & bersihkan riwayat git (P0-1), autentikasi jalur MQTT (P0-2), dan perbaiki alur pemilihan kuis di kiosk (P1-4) — yang terakhir ini membuat fitur utama produk menyortir sampah ke tong yang salah.

### Status verifikasi

Semua temuan di bawah ini diverifikasi langsung, bukan dibaca sekilas:

```
backend      php artisan test        → 76 passed (219 assertions)
cv-service   pytest                  → 20 passed
frontend     tsc -b --noEmit         → bersih;  oxlint → 3 warning fast-refresh
kiosk        tsc -b --noEmit         → bersih;  oxlint → bersih
```

Untuk P1-1 saya menulis test sementara yang menembak setiap route admin dengan token unit kiosk; hasil mentahnya dicantumkan di temuan tersebut.

---

# 🔴 P0 — KRITIS

Empat temuan ini bisa dieksploitasi hari ini oleh siapa pun yang berada di jaringan sekolah, atau oleh siapa pun yang bisa membaca repositori.

---

## P0-1 · Kredensial WiFi tertulis di kode dan sudah masuk riwayat git

**Berkas:** [BunnyBin_ESP32.ino:43-44](BunnyBin_ESP32.ino#L43-L44)

```cpp
const char* WIFI_SSID     = "zzz";
const char* WIFI_PASSWORD = "21212121";
```

Password ini masuk repositori pada commit `3b926e1` ("feat: implementation real device ESP 32") dan ada di dua commit pada branch `main`. Mengeditnya sekarang **tidak** menghapusnya — `git log -S'21212121'` tetap menemukannya, dan siapa pun yang pernah clone repo ini sudah memilikinya.

Perlu ditegaskan: password `21212121` juga lemah secara mandiri (8 digit berulang, WPA2 pecah dalam hitungan detik dengan wordlist). Kalau jaringan `zzz` adalah hotspot demo sekali pakai, dampaknya terbatas; kalau ia jaringan yang sama dengan tempat sekolah akan memasang unit, ini adalah jalan masuk langsung ke seluruh sistem — termasuk broker MQTT yang tidak terautentikasi di P0-2.

**Perbaikan:**
1. **Ganti password WiFi-nya lebih dulu.** Ini langkah pertama dan tidak bisa digantikan oleh langkah git mana pun.
2. Pindahkan kredensial ke berkas terpisah yang di-gitignore, mis. `secrets.h` (`#include "secrets.h"`), dengan `secrets.h.example` yang ter-commit sebagai templat — pola yang sudah dipakai proyek ini dengan benar di `docker/.env.roboflow.example`.
3. Bersihkan riwayat dengan `git filter-repo` (atau terima keberadaannya dan cukup andalkan langkah 1 — untuk repo dengan 19 commit, rewrite masih murah).

> **Catatan:** memori proyek mencatat `BunnyBin_ESP32.ino` **DIBEKUKAN** atas keputusan Anda. Perubahan struktural firmware memang sebaiknya ditunda, tapi rotasi password adalah operasi jaringan — bisa dilakukan tanpa menyentuh baris kode mana pun, cukup flash ulang dengan nilai baru.

---

## P0-2 · Jalur ingest MQTT tidak punya autentikasi sama sekali

**Berkas:** [docker/mosquitto/mosquitto.conf:4-5](docker/mosquitto/mosquitto.conf#L4-L5), [docker/docker-compose.yml:51-52](docker/docker-compose.yml#L51-L52), [backend/app/Jobs/ProcessSensorReading.php:27](backend/app/Jobs/ProcessSensorReading.php#L27)

```conf
listener 1883
allow_anonymous true
```

Broker menerima koneksi anonim, dan portnya dipublish ke `0.0.0.0:1883` (bukan `127.0.0.1:1883` seperti yang dilakukan dengan benar pada service `cv-service` di baris 45). Di sisi backend, `ProcessSensorReading` mengambil identitas device **langsung dari nama topik**:

```php
[, $unitCode, $channel] = $parts;              // MqttListen.php:47
$unit = Unit::where('code', $this->unitCode)->first();   // ProcessSensorReading.php:27
```

Tidak ada satu pun langkah yang memverifikasi bahwa pengirim benar-benar unit tersebut. Siapa pun di jaringan yang sama cukup menjalankan satu perintah:

```bash
mosquitto_pub -h <ip> -t 'binexa/BNX-001/sensor' \
  -m '{"organic_distance_cm":0.5,"inorganic_distance_cm":0.5}'
```

...untuk membuat dashboard sekolah melaporkan tong penuh 100%, memicu alert `fill_90`, dan mengirim petugas kebersihan ke tong yang kosong. Sebaliknya, mem-publish jarak "kosong" tiap 5 menit menahan status `active` selamanya sehingga tong yang benar-benar penuh tidak pernah muncul di alert.

Kontras yang menarik: **jalur HTTP ke endpoint yang sama sudah dilindungi dengan benar.** `EnsureKioskUnit` memeriksa token DAN mencocokkan `$caller->code === $request->route('code')` — persis pengecekan yang hilang di jalur MQTT. Dua pintu masuk yang menurut komentar `DeviceIngestService` "harus berperilaku identik" ternyata punya postur keamanan yang berlawanan.

**Perbaikan:**
1. `allow_anonymous false` + `password_file`, satu kredensial per unit.
2. Batasi ACL Mosquitto agar unit `BNX-001` hanya boleh publish ke `binexa/BNX-001/#` — ini menutup lubang identitas di level broker, tanpa mengubah kode backend.
3. Jangan publish port 1883 ke luar host di compose dev (`127.0.0.1:1883:1883`).
4. Untuk produksi: TLS + client certificate per device.

---

## P0-3 · Token kiosk dibundel ke JavaScript publik dan tidak pernah kedaluwarsa

**Berkas:** [frontend-kiosk/src/api/config.ts:16](frontend-kiosk/src/api/config.ts#L16), [frontend-kiosk/src/api/http.ts:12](frontend-kiosk/src/api/http.ts#L12), [backend/config/sanctum.php:53](backend/config/sanctum.php#L53)

```ts
kioskToken: import.meta.env.VITE_KIOSK_API_TOKEN ?? '',
// → headers: { Authorization: `Bearer ${config.kioskToken}` }
```

Semua variabel `VITE_*` di-inline ke dalam bundle saat build. Token Sanctum unit ini karenanya **ada dalam bentuk teks polos di dalam file `.js` yang dilayankan ke browser** — bisa dibaca lewat View Source, DevTools, atau dengan `grep` pada folder `dist/`. Dan Sanctum dikonfigurasi tanpa masa berlaku:

```php
'expiration' => null,   // config/sanctum.php:53
```

Sehingga token yang bocor berlaku selamanya. Perangkat kiosk adalah tablet yang ditempel di tong sampah sekolah dan dipakai anak-anak tanpa pengawasan penuh — asumsi bahwa tidak ada yang akan membuka DevTools di sana tidak realistis.

Yang bisa dilakukan dengan token curian:
- Menulis fill snapshot & sort log palsu untuk unit itu (mengotori metrik akurasi & riwayat time-series).
- Membanjiri `/cv/classify` sampai 600 request/menit — batas rate limit di `AppServiceProvider.php:32` melindungi backend dari flood, tapi tidak mencegah penyalahgunaan model CV oleh pemegang token sah.
- Menahan unit tetap "online" (`markSeen`) sehingga kerusakan nyata tidak terdeteksi.

Ada juga satu token hidup tersimpan sebagai teks polos di `frontend-kiosk/.env` di mesin ini (`1|7ZhIiL06...`). Berkas itu ter-gitignore dengan benar sehingga **tidak** masuk repositori, tapi karena ia sudah pernah muncul di transkrip/log sesi, sebaiknya dicabut dan diterbitkan ulang.

**Perbaikan:**
1. Set `SANCTUM_TOKEN_EXPIRATION` (mis. 30 hari) supaya token bocor punya batas waktu.
2. Cabut & terbitkan ulang token `BNX-001` sekarang — `php artisan unit:token BNX-001` sudah otomatis mencabut yang lama (`IssueUnitToken.php:25`), jadi ini operasi satu perintah.
3. Jangka menengah, hilangkan token dari bundle: kiosk melakukan device-provisioning saat boot (tukar kode aktivasi sekali pakai → token, simpan di `localStorage`), sehingga rahasia tidak pernah ada di dalam artefak build.
4. Batasi ability token `kiosk` seketat mungkin (sudah dilakukan) dan tambahkan alert bila satu unit mengirim volume abnormal.

---

## P0-4 · Tidak ada rate limit di endpoint login (maupun di API lain)

**Berkas:** [backend/routes/api.php:14](backend/routes/api.php#L14), [backend/bootstrap/app.php:14-21](backend/bootstrap/app.php#L14-L21)

```php
Route::post('/auth/login', [AuthController::class, 'login']);   // tanpa middleware apa pun
```

Laravel 11+ **tidak lagi** memasang `throttle:api` secara otomatis; ia harus diaktifkan eksplisit dengan `$middleware->throttleApi()` di `bootstrap/app.php`. Berkas tersebut hanya memanggil `statefulApi()` dan mendaftarkan dua alias — tidak ada throttling di mana pun.

Akibatnya, satu-satunya endpoint yang punya rate limit di seluruh aplikasi adalah `/cv/classify`. `/auth/login` menerima percobaan password tak terbatas, dari IP mana pun, secepat server bisa menjawab. Dengan `BCRYPT_ROUNDS=12` biaya per percobaan memang tinggi (~200ms), yang memperlambat serangan — tapi itu juga berarti **beberapa ratus request paralel sudah cukup membuat CPU server habis**, jadi lubang yang sama sekaligus menjadi vektor DoS.

Kombinasi dengan seeder yang password default-nya `password` ([DatabaseSeeder.php:50](backend/database/seeders/DatabaseSeeder.php#L50), dari `SEED_ADMIN_PASSWORD` yang di `.env` memang diisi `password`) membuat akun `admin@binexa.id` bisa ditebak dalam satu percobaan bila instance ter-deploy dengan seed default.

**Perbaikan:**
```php
// bootstrap/app.php
$middleware->throttleApi();          // baseline seluruh /api

// routes/api.php
Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1');    // 5 percobaan/menit per IP
```
Tambahan: pakai `RateLimiter` per-email selain per-IP agar serangan terdistribusi ikut tertahan, dan wajibkan `SEED_ADMIN_PASSWORD` terisi (gagalkan seeder bila kosong) alih-alih fallback ke `'password'`.

---

# 🟠 P1 — TINGGI

Belum bisa dieksploitasi dari luar seperti P0, tapi masing-masing menyebabkan kehilangan data, kesalahan fungsional, atau menghalangi jalan ke produksi.

---

## P1-1 · Token unit kiosk diterima di seluruh route admin — batas otorisasi hanya ditegakkan oleh kebetulan

**Berkas:** [backend/routes/api.php:29](backend/routes/api.php#L29), [backend/app/Models/Concerns/BelongsToSchoolScope.php:10](backend/app/Models/Concerns/BelongsToSchoolScope.php#L10)

Grup route admin hanya dilindungi `auth:sanctum`. Karena `Unit` memakai `HasApiTokens` dan mengimplementasi `Authenticatable`, **token kiosk lolos dari middleware itu** persis seperti sesi admin. Saya memverifikasinya dengan test sementara yang menembak setiap route memakai token unit `BNX-999`:

```
/api/units             => 500
/api/dashboard/summary => 500
/api/alerts            => 500
/api/sort-logs         => 500
/api/quiz-items        => 200   (memang disengaja — kiosk butuh bank kuis)
/api/schools           => 403   (tertahan EnsureRole)
/api/auth/me           => 200   ← mengembalikan profil untuk sebuah Unit
```

Empat endpoint membalas **500, bukan 403**. Penyebabnya bukan pengecekan otorisasi, melainkan `TypeError`: `scopeForUser(Builder $query, AdminUser $user)` menerima `Unit`. Dengan kata lain, satu-satunya yang mencegah kiosk membaca data lintas sekolah adalah *type hint PHP*.

Ini rapuh karena dua alasan. Pertama, endpoint apa pun yang ditambahkan nanti tanpa type hint `AdminUser` akan **membocorkan data, bukan crash** — dan tidak ada test yang akan menangkapnya. Kedua, `/auth/me` sudah menunjukkan gejalanya sekarang: ia membalas `200` dengan `role: null` untuk sebuah objek `Unit`, karena `AuthController::profile()` tidak pernah memeriksa jenis pemanggil.

`EnsureKioskUnit` melakukan hal yang benar di arah sebaliknya (`abort_unless($caller instanceof Unit ...)`). Yang hilang adalah pasangannya.

**Perbaikan:** buat middleware `EnsureAdminUser` yang memaksa `$request->user() instanceof AdminUser`, pasang di grup route admin, dan tambahkan test yang mengunci ekspektasi 403 untuk ketujuh route di atas.

---

## P1-2 · Firmware menyembunyikan kegagalan sensor sebagai "tong kosong" — deteksi `sensor_fault` backend jadi tidak pernah aktif

**Berkas:** [BunnyBin_ESP32.ino:74-75, 100, 112-126](BunnyBin_ESP32.ino#L74-L126)

Backend punya mekanisme yang bagus untuk ini. `Unit::fillPctFromDistance()` mengembalikan `null` bila jarak di luar rentang wajar, dan `DeviceIngestService` menerjemahkannya jadi alert `sensor_fault` dengan alasan yang ditulis eksplisit di [AlertEngineService.php:22-24](backend/app/Services/AlertEngineService.php#L22-L24):

> *"Tanpa ini, sensor mati terbaca sebagai 'tong kosong terus' dan tidak pernah terdeteksi petugas."*

Persis skenario itulah yang tetap terjadi, karena firmware tidak pernah membiarkan pembacaan buruk sampai ke backend:

```cpp
float organikDistanceCm = BIN_HEIGHT_CM;         // baris 74 — inisialisasi = 55 cm = "0% penuh"

if (distanceCm < 0 || distanceCm > (BIN_HEIGHT_CM + 20)) return -1;   // baris 100
...
float dOrganik = readDistanceCm(...);
if (dOrganik > 0) { organikDistanceCm = dOrganik; ... }               // baris 114 — nilai lama DIPERTAHANKAN
```

Saat sensor lepas, mati, atau echo hilang, `readDistanceCm` mengembalikan `-1`, blok `if` dilewati, dan firmware terus menyiarkan **nilai terakhir yang valid** — atau, kalau sensor mati sejak boot, nilai inisialisasi `55.0 cm`. Backend menerima 55 cm, yang sepenuhnya berada dalam rentang sah untuk tong 55 cm, menghitungnya sebagai 0%, dan tidak pernah membuat alert.

Hasil akhirnya: **tong dengan sensor rusak tampil sebagai tong kosong yang sehat di dashboard, tanpa batas waktu.** Seluruh mekanisme sensor-fault yang sudah dibangun dengan benar di backend berada di belakang gerbang yang tidak pernah terbuka.

**Perbaikan (perlu menyentuh firmware yang dibekukan):** kirimkan sentinel alih-alih menyembunyikan kegagalan — mis. `organik_distance_cm: -1` atau field terpisah `organik_error: true`, lalu terjemahkan di `RealEsp32Client` menjadi pembacaan yang backend tolak. Sebagai jalan pintas tanpa mengubah firmware, `RealEsp32Client.getStatus()` bisa mendeteksi nilai yang tidak berubah sama sekali selama N polling berturut-turut dan melaporkannya sebagai anomali.

---

## P1-3 · Firmware tidak pernah menyambung ulang WiFi — satu gangguan jaringan mematikan unit sampai di-reboot manual

**Berkas:** [BunnyBin_ESP32.ino:265-286, 304-320](BunnyBin_ESP32.ino#L265-L320)

Koneksi WiFi hanya dicoba di `setup()`, maksimal 40 kali, lalu menyerah:

```cpp
while (WiFi.status() != WL_CONNECTED && attempt < 40) { delay(500); ... }
...
} else {
  Serial.println("\nGagal konek WiFi. Cek SSID/password lalu restart ESP32.");
}
```

`loop()` tidak pernah memeriksa `WiFi.status()` lagi. Router restart, hotspot mati sebentar, atau sinyal drop → ESP32 offline permanen sampai ada orang datang mencabut dan menancapkan kembali dayanya. Untuk perangkat yang dipasang di kantin sekolah dan seharusnya berjalan tanpa pengawasan, ini adalah mode kegagalan yang paling mungkin sering terjadi.

Perbandingan yang layak dicatat: `MqttListen` di backend melakukan hal yang benar untuk masalah yang sama — loop luar dengan reconnect dan `sleep(5)` ([MqttListen.php:18-34](backend/app/Console/Commands/MqttListen.php#L18-L34)), lengkap dengan komentar yang menjelaskan kenapa. Firmware butuh perlakuan yang sama.

**Perbaikan:** `WiFi.setAutoReconnect(true)` di setup, plus pemeriksaan berkala di `loop()` yang memanggil `WiFi.begin()` ulang bila status bukan `WL_CONNECTED`, dan `ESP.restart()` sebagai upaya terakhir setelah N menit gagal.

---

## P1-4 · Kiosk menyortir sampah berdasarkan quiz item ACAK, bukan berdasarkan hasil deteksi CV

**Berkas:** [frontend-kiosk/src/context/KioskProvider.tsx:273-295, 415-419](frontend-kiosk/src/context/KioskProvider.tsx#L273-L295)

Ini bug fungsional inti — fitur utama produk, dan ia salah.

Setelah CV mengonfirmasi deteksi, `pickItem()` memilih pertanyaan kuis:

```ts
// deteksi cocok kategorinya, tapi item DIPILIH ACAK dari kategori itu
const scoped = bank.filter((q) => q.category === detection.category)
if (scoped.length) return randomFrom(scoped)
...
// confidence rendah / tidak terdeteksi → ACAK DARI SELURUH BANK
return randomFrom(bank)
```

Lalu, saat anak menjawab benar, servo digerakkan berdasarkan **kategori quiz item itu** — bukan berdasarkan kategori yang dideteksi kamera:

```ts
if (choice === item.category) {
  ...
  await clients.esp32.sort({ category: item.category })   // baris 419
```

Dua konsekuensi:

1. **Pertanyaan tidak nyambung dengan benda di tangan anak.** Anak memasukkan kulit pisang, layar bertanya tentang "Ampas teh". Nilai edukasinya hilang — anak belajar menebak kategori dari nama di layar, bukan dari benda yang ia pegang.

2. **Sampah masuk ke tong yang salah.** Ketika confidence rendah atau CV gagal, `pickItem` jatuh ke `randomFrom(bank)` — seluruh bank, lintas kategori. Anak memegang botol plastik, ditanya "Kulit pisang", menjawab "organik" (jawaban *benar* untuk pertanyaannya), dan servo mengarahkan botol plastik ke tray organik. Sistem mencatatnya sebagai `is_correct: true`. Data akurasi di dashboard melaporkan keberhasilan atas pemilahan yang secara fisik salah.

Ada juga masalah turunan: bila jawaban **salah**, tidak ada panggilan `esp32.sort()` sama sekali (baris 428-432) — sampah tidak pernah disortir secara fisik, dan state auto-reset setelah 9 detik meninggalkannya menggantung di tray netral tanpa penjelasan ke anak.

**Perbaikan:**
1. Servo harus mengikuti `detection.category`, bukan `item.category`. Deteksi CV adalah sumber kebenaran tentang apa yang benar-benar ada di dalam tong.
2. Bila `detection.category === null` (CV gagal), jangan tampilkan kuis acak — tampilkan layar "coba lagi" atau minta anak memilih sendiri, lalu sortir berdasarkan pilihan anak. Menebak lebih buruk daripada mengakui tidak tahu.
3. Untuk pertanyaan kuis, cocokkan berdasarkan `detection.label` (lihat P2-3), dan hanya jatuh ke acak-satu-kategori bila label tidak dikenali.
4. Pada jawaban salah, tetap sortir secara fisik setelah menampilkan penjelasan — jangan tinggalkan sampah di tray netral.

---

## P1-5 · Continuous aggregate `fill_hourly` tidak pernah dibaca, dan retention 90 hari akan mengosongkan grafik jangka panjang

**Berkas:** [backend/database/migrations/2026_07_07_100009_create_fill_hourly_continuous_aggregate.php](backend/database/migrations/2026_07_07_100009_create_fill_hourly_continuous_aggregate.php), [backend/app/Http/Controllers/Api/UnitController.php:100-105, 145-154](backend/app/Http/Controllers/Api/UnitController.php#L100-L154)

Migration membuat materialized view TimescaleDB `fill_hourly` beserta kebijakan refresh 30 menit, lalu memasang retention 90 hari pada tabel mentah:

```sql
SELECT add_retention_policy('fill_snapshots', INTERVAL '90 days')
```

Tapi `grep -rn "fill_hourly"` di seluruh `backend/` hanya menemukan migration itu sendiri. Endpoint `fill-history` dengan `interval=hourly` justru meng-agregasi **tabel mentah** secara on-the-fly:

```php
return $this->timescaleAvailable()
    ? "time_bucket('1 hour', recorded_at)"      // dijalankan atas fill_snapshots
    : "date_trunc('hour', recorded_at)";
```

Dua akibat:

- **Bom waktu data.** Endpoint mengizinkan rentang `hourly` sampai 366 hari (`$maxDays = 366`, baris 85), tapi datanya dihapus setelah 90 hari. Setelah tiga bulan berjalan, permintaan grafik "1 tahun terakhir" akan mengembalikan array kosong untuk 9 bulan pertamanya — data agregatnya *ada* di `fill_hourly`, tapi tidak ada kode yang membacanya. Ini akan muncul sebagai "grafik tiba-tiba kosong" berbulan-bulan setelah deploy, jauh dari perubahan kode mana pun.
- **Biaya query sia-sia.** Setiap permintaan hourly memindai baris mentah dan meng-agregasi ulang hal yang sudah dihitung dan disimpan oleh TimescaleDB.

**Perbaikan:** arahkan cabang `hourly` di `fillHistory()` untuk membaca `fill_hourly` bila Timescale tersedia (dengan fallback yang ada sekarang untuk Postgres polos/SQLite). Selaraskan juga `$maxDays` dengan retensi sebenarnya per sumber data.

---

## P1-6 · Antrean retry kiosk hanya ada di memori — refresh halaman menghapus seluruh log sortir yang tertunda

**Berkas:** [frontend-kiosk/src/context/KioskProvider.tsx:78, 182-203, 240](frontend-kiosk/src/context/KioskProvider.tsx#L182-L203)

```ts
const retryQueueRef = useRef<SortLogPayload[]>([])
```

Kiosk punya penanganan mode offline yang dipikirkan matang: `errors.ts` membedakan penolakan permanen dari kegagalan sementara, dengan komentar panjang yang menjelaskan mahalnya kesalahan itu di masa lalu (kasus 419 CSRF). Semua kehati-hatian itu dibangun di atas array JavaScript biasa.

Antrean hilang total pada: refresh halaman, tab crash, tablet reboot, atau update aplikasi. Untuk kiosk yang menyala terus di sekolah dengan WiFi yang tidak stabil, sesi offline yang panjang lalu berakhir dengan reboot adalah kejadian rutin — dan setiap sortiran anak selama periode itu lenyap tanpa jejak. Backend tidak akan pernah tahu bahwa data itu pernah ada.

**Perbaikan:** persist antrean ke `localStorage` (atau IndexedDB untuk volume lebih besar) pada setiap enqueue/dequeue, dan muat ulang saat boot. Payload-nya kecil dan sudah punya `ts` sendiri, jadi log yang terlambat terkirim tetap mendarat di waktu yang benar — mekanisme itu sudah ada dan sudah diuji (`KioskIngestTest`: *"it records the kiosk timestamp so queued logs land at the time they..."*).

---

## P1-7 · Tidak ada CI, tidak ada compose produksi, tidak ada Dockerfile untuk backend/frontend

**Berkas:** tidak ada `.github/`; hanya [cv-service-fastapi/Dockerfile](cv-service-fastapi/Dockerfile) yang ada

Proyek punya 96 test yang berjalan dan lulus di tiga bahasa — tapi tidak ada yang menjalankannya secara otomatis. Tidak ada `.github/workflows/`, tidak ada `.gitlab-ci.yml`. Regresi hanya tertangkap bila seseorang ingat menjalankan tiga perintah di tiga direktori berbeda.

Untuk deployment, `docker/docker-compose.yml` menyatakan dirinya secara eksplisit sebagai dev-only, dan menunda sisanya:

```yaml
# Compose produksi full-stack (Fase 8) akan berada di root repo
# Produksi (Fase 8): internal-only via expose, tanpa publish.
# Produksi (Fase 8) memakai password_file + persistence  ← mosquitto.conf
```

Fase 8 belum dikerjakan (konsisten dengan catatan memori proyek). Artinya saat ini tidak ada jalur yang bisa direproduksi dari repo ke sekolah: Laravel dan kedua frontend tidak punya Dockerfile, dan konfigurasi produksi Mosquitto yang menutup P0-2 justru berada di dalam Fase 8 yang tertunda itu.

**Perbaikan:**
1. Workflow CI minimal — tiga job paralel: `php artisan test`, `pytest`, `npm run build && npm run lint` untuk kedua frontend. Ini murah dan langsung mengunci semua perbaikan di dokumen ini agar tidak berbalik.
2. Dockerfile untuk backend (PHP-FPM + nginx) dan build stage statis untuk kedua frontend.
3. `docker-compose.prod.yml` di root: `APP_DEBUG=false`, mosquitto ber-password, CV service internal-only, volume persisten untuk Postgres.

---

## P1-8 · Direktori `docs/` di-gitignore padahal README menautkannya sebagai spesifikasi

**Berkas:** [.gitignore:5](.gitignore#L5), [README.md:23](README.md#L23), [frontend-kiosk/README.md:3](frontend-kiosk/README.md#L3)

```gitignore
docs/
```

Tujuh berkas PRD (`PRD-Backend-Laravel.md`, `PRD-Database.md`, `PRD-Frontend.md`, dan seterusnya, total ~70 KB) ada di disk tapi tidak ada di repositori. Sementara itu, keduanya README merujuknya sebagai sumber kebenaran, dan kode pun begitu:

```php
// MqttListen.php:18  → "(PRD-Backend §5.1)"
// docker-compose.yml → "sesuai docs/PRD-Infrastructure-Deployment.md §2"
// RealCloudClient.ts → "Endpoint per PRD-Backend-Laravel.md §3 + addendum §7"
```

Siapa pun yang melakukan clone bersih mendapat basis kode yang berulang kali merujuk dokumen yang tidak ada. Untuk proyek yang komentarnya bersandar pada nomor pasal PRD, ini menghapus separuh konteksnya.

Kemungkinan besar baris ini ditujukan untuk mengabaikan artefak build dokumentasi, bukan spesifikasi tulisan tangan.

**Perbaikan:** hapus `docs/` dari `.gitignore` dan commit ketujuh PRD. Bila ada berkas turunan di sana, abaikan secara spesifik (`docs/build/`, `docs/*.pdf`).

---

# 🟡 P2 — SEDANG

---

## P2-1 · Backend memercayai timestamp yang dikirim device tanpa batas

**Berkas:** [backend/app/Services/DeviceIngestService.php:154-161](backend/app/Services/DeviceIngestService.php#L154-L161), [backend/app/Http/Controllers/Api/KioskIngestController.php:36, 72](backend/app/Http/Controllers/Api/KioskIngestController.php#L36)

```php
return isset($payload['ts']) ? Carbon::parse($payload['ts']) : now();
```

Validasi hanya `['nullable', 'date']` — tidak ada batas rentang. Kiosk (atau siapa pun yang memegang tokennya, lihat P0-3, atau siapa pun di jaringan MQTT, lihat P0-2) bisa menulis baris dengan `ts` tahun 2099 atau 1970.

Dampaknya lebih dari sekadar angka aneh di tabel: `recorded_at` dan `created_at` adalah **kolom partisi hypertable TimescaleDB**. Baris dengan tanggal ekstrem memaksa pembuatan chunk yang jauh di luar rentang normal, membuat grafik ter-skala habis oleh satu outlier, dan bisa membuat kebijakan retensi berperilaku tak terduga. Kasus yang paling mungkin bahkan bukan serangan — cukup tablet kiosk dengan jam sistem yang belum ter-sinkron NTP setelah reboot.

**Perbaikan:** tolak `ts` yang lebih dari beberapa menit di masa depan atau lebih dari beberapa hari di masa lalu (`'before:+5 minutes', 'after:-7 days'`), dan jatuhkan ke `now()` jika di luar rentang — sambil mencatat log agar jam yang melenceng terlihat.

---

## P2-2 · CV service tidak punya autentikasi apa pun

**Berkas:** [cv-service-fastapi/app/main.py:76-77](cv-service-fastapi/app/main.py#L76-L77)

`POST /classify` terbuka untuk siapa saja yang bisa mencapai portnya. Saat ini mitigasinya murni topologi: compose dev mem-bind ke `127.0.0.1:8800`, dan komentar berjanji akan `expose` internal-only di produksi. Itu perlindungan yang benar, tapi ia sepenuhnya bergantung pada Fase 8 yang belum ada (P1-7) — dan satu kesalahan konfigurasi port di kemudian hari langsung membuka layanan inferensi ke internet, dengan biaya CPU/GPU yang ditanggung sendiri.

**Perbaikan:** shared secret sederhana lewat header (`X-Internal-Token`), diverifikasi sebagai dependency FastAPI dan dikirim oleh `CvClientService`. Murah, dan tidak lagi menggantungkan segalanya pada topologi jaringan.

---

## P2-3 · Pemetaan label kiosk memakai label COCO, sedangkan model produksi mengeluarkan label bahasa Indonesia

**Berkas:** [frontend-kiosk/src/context/KioskProvider.tsx:249-271](frontend-kiosk/src/context/KioskProvider.tsx#L249-L271) vs [cv-service-fastapi/app/config.py:74-95](cv-service-fastapi/app/config.py#L74-L95)

Kiosk mencocokkan deteksi ke quiz item lewat tabel ini:

```ts
const LABEL_TO_QUIZ: Record<string, string[]> = {
  bottle: ['Botol'], banana: ['Pisang'], apple: ['Apel'], ...
}
```

Semuanya label COCO. Tapi model produksi (`LABEL_MAP_NAMED`, hasil training kustom Binexa) mengeluarkan `botol_plastik`, `kulit_buah`, `sisa_makanan`, `bungkus_snack` — dan model Roboflow mengeluarkan `Sampah Organik` / `Sampah Anorganik`. Tidak satu pun kunci di `LABEL_TO_QUIZ` yang akan pernah cocok.

Jadi cabang pencocokan spesifik itu **mati total** di mode produksi, dan setiap deteksi langsung jatuh ke `randomFrom(scoped)` — yang memperburuk P1-4. Tabel ini adalah sisa dari fase demo COCO yang tidak ikut diperbarui saat model bernama dilatih.

**Perbaikan:** ganti isinya dengan kunci dari `LABEL_MAP_NAMED` + varian Roboflow. Lebih baik lagi, pindahkan pemetaan ini ke backend (di sebelah `DISPLAY_NAMES` yang sudah ada di `config.py`) dan sajikan lewat API, supaya menambah kelas model tidak memerlukan rebuild kiosk.

---

## P2-4 · `CvProxyController` menulis `sort_logs` sendiri, melanggar aturan yang ditulis `DeviceIngestService`

**Berkas:** [backend/app/Http/Controllers/Api/CvProxyController.php:48-59](backend/app/Http/Controllers/Api/CvProxyController.php#L48-L59)

`DeviceIngestService` membuka diri dengan peringatan yang sangat spesifik:

> *"Kalau logika ini disalin ke masing-masing pintu, konversi jarak→persen dan aturan alert akan bergeser diam-diam di antara keduanya."*

Lalu `CvProxyController` melakukan persis itu:

```php
$caller->sortLogs()->create([
    'quiz_item_id' => $quizItem->id,
    'category_detected' => $result->category,
    'confidence' => $result->confidence,
    'is_correct' => $result->category === null ? null : $result->category === $quizItem->category,
]);
```

Ini menduplikasi logika penilaian `DeviceIngestService::recordSort()` — tapi tidak identik: ia mengabaikan `ts`, tidak menerima override `is_correct`, dan tidak memakai jalur validasi yang sama. Pintu masuk ketiga yang tidak disebut dalam komentar dua-pintu itu.

Saat ini jarang aktif (kiosk memanggil `/cv/classify` tanpa `unit_code`+`quiz_item_id`, lihat `RealCloudClient.ts:33`), yang justru membuatnya berbahaya: ia dead code yang akan hidup diam-diam saat seseorang mulai mengirim parameter itu.

**Perbaikan:** panggil `$ingest->recordSort($caller, [...])` alih-alih menulis langsung. Kalau jalur ini memang tidak dipakai, hapus saja blok tersebut.

---

## P2-5 · Dedup alert berbasis "belum dibaca" — menandai alert terbaca membuka pintu spam ulang

**Berkas:** [backend/app/Services/AlertEngineService.php:84-91](backend/app/Services/AlertEngineService.php#L84-L91)

```php
return Alert::where('unit_id', $unit->id)
    ->where('alert_type', $type)
    ->where('is_read', false)          // ← syarat ini
    ->where('created_at', '>', now()->subHour())
    ->exists();
```

Niatnya dijelaskan sebagai anti-spam ("hindari spam saat sensor lapor tiap 30 menit"), tapi syarat `is_read = false` membatalkannya. Begitu admin menandai alert `fill_90` sebagai terbaca — tindakan normal, bahkan tindakan yang diinginkan — pembacaan sensor berikutnya membuat alert `fill_90` baru. Tong yang penuh dan menunggu dikosongkan akan menghasilkan alert baru setiap kali admin membersihkan inbox-nya.

**Perbaikan:** hapus klausa `is_read` dari pengecekan dedup. Jendela satu jam sudah cukup menjadi throttle-nya; status baca adalah urusan UI, bukan urusan mesin alert.

---

## P2-6 · Backend hanya diuji di atas SQLite — jalur PostgreSQL/TimescaleDB tidak pernah dieksekusi

**Berkas:** [backend/phpunit.xml:24-25](backend/phpunit.xml#L24-L25)

```xml
<env name="DB_CONNECTION" value="sqlite"/>
<env name="DB_DATABASE" value=":memory:"/>
```

76 test lulus, tapi semuanya di atas SQLite. Yang berarti kode berikut **tidak pernah dijalankan oleh satu test pun**:

- Cabang `time_bucket()` dan `date_trunc()` di `hourlyBucketExpression()` — hanya cabang `strftime` SQLite yang teruji (`UnitController.php:145-154`).
- Seluruh manipulasi hypertable di migration (`DROP CONSTRAINT ... ADD PRIMARY KEY (id, recorded_at)`, `create_hypertable`) — dilewati seluruhnya oleh guard `DB::getDriverName() !== 'pgsql'`.
- Continuous aggregate & retention policy.
- Perilaku `timestampTz` dan zona waktu, yang berbeda nyata antara SQLite dan Postgres.

Compose bahkan sudah menyediakan bahan untuk menutup ini: profil `postgres-plain` (port 5435) memang dibuat untuk menguji bahwa migration tetap sukses tanpa extension. Ia hanya belum pernah dipakai dalam pipeline apa pun.

**Perbaikan:** tambahkan job CI kedua yang menjalankan suite yang sama terhadap `timescale/timescaledb` (dan ketiga terhadap `postgres-plain`). Test-nya sudah ada; yang dibutuhkan hanya matriks koneksi.

---

## P2-7 · Tidak ada test sama sekali di kedua frontend

**Berkas:** `frontend/src/`, `frontend-kiosk/src/` — nol berkas `*.test.*` / `*.spec.*`

`npm run lint` dan `tsc -b` menangkap kesalahan tipe dan gaya, tapi tidak ada satu pun test perilaku. Yang tidak terlindungi termasuk bagian yang justru paling rumit dan paling mahal bila salah:

- `kioskReducer` — state machine dengan 8 fase; kandidat sempurna untuk unit test murni, tanpa perlu DOM.
- `toCloudError` — klasifikasi retryable vs permanen, yang komentarnya sendiri mencatat pernah menyebabkan kehilangan data senyap.
- `pickItem` / `LABEL_TO_QUIZ` — tempat bug P1-4 dan P2-3 bersembunyi; satu test tabel akan menangkap keduanya seketika.
- `RealEsp32Client` — penerjemah nama Indonesia↔Inggris, yang oleh komentarnya sendiri disebut sebagai satu-satunya penjaga agar nama firmware tidak bocor ke skema database.

**Perbaikan:** Vitest untuk keempatnya. Tidak butuh browser; ini semua fungsi murni dan kelas kecil.

---

## P2-8 · `sort_logs` tumbuh selamanya — hypertable tanpa retention policy

**Berkas:** [backend/database/migrations/2026_07_07_100009_...php:41](backend/database/migrations/2026_07_07_100009_create_fill_hourly_continuous_aggregate.php#L41)

`fill_snapshots` mendapat retensi 90 hari. `sort_logs` — yang juga hypertable, dan yang bertambah setiap kali seorang anak berinteraksi dengan kiosk — tidak mendapat kebijakan apa pun. Untuk data edukasi jangka panjang ini mungkin memang disengaja, tapi keputusannya tidak tercatat di mana pun, dan tidak ada agregat yang menampung ringkasannya bila nanti diputuskan untuk memangkas.

**Perbaikan:** putuskan secara eksplisit — entah retensi + continuous aggregate harian untuk statistik jangka panjang, atau komentar di migration yang menyatakan pertumbuhan tak terbatas memang disengaja.

---

## P2-9 · API ESP32 tanpa autentikasi dengan CORS `*` — siapa pun di WiFi bisa menggerakkan servo

**Berkas:** [BunnyBin_ESP32.ino:156-160, 206](BunnyBin_ESP32.ino#L156-L160)

```cpp
server.sendHeader("Access-Control-Allow-Origin", "*");
```

`POST /api/sort` menerima perintah dari siapa saja tanpa kredensial. Setiap perangkat di jaringan sekolah bisa menggerakkan servo sesuka hati; dan karena CORS-nya `*`, **halaman web mana pun** yang dibuka di perangkat pada jaringan itu bisa melakukannya dari JavaScript. Ini juga menjadi vektor keausan mekanis: MG996R yang digerakkan berulang-ulang tanpa henti akan aus jauh lebih cepat dari umur wajarnya.

Dampaknya terbatas pada jaringan lokal, karenanya P2 dan bukan P0 — tapi jaringan lokal itu adalah jaringan yang password-nya ada di P0-1.

**Perbaikan:** shared secret di header untuk `/api/sort` (`GET /api/status` boleh tetap terbuka), dan persempit `Access-Control-Allow-Origin` ke origin kiosk.

---

## P2-10 · `CvClientService` mengulang request pada error 4xx

**Berkas:** [backend/app/Services/CvClientService.php:14-18](backend/app/Services/CvClientService.php#L14-L18)

```php
Http::timeout(10)->retry(2, 500, throw: false)->post(...)
```

`retry()` milik Laravel mengulang setiap response gagal, termasuk 4xx. Gambar tidak valid yang dijawab 422 oleh CV service akan dikirim **dua** kali dengan jeda 500 ms sebelum menyerah (`retry(2)` = jumlah percobaan total, bukan pengulangan tambahan — diverifikasi saat perbaikan) — padahal kode di bawahnya sudah tahu 4xx itu permanen dan meneruskannya ke pemanggil (baris 29-31).

Dengan kiosk yang mengirim frame tiap 200 ms selama scanning, satu kondisi kamera yang buruk melipatgandakan beban ke CV service tepat saat ia sedang paling sibuk.

**Perbaikan:**
```php
->retry(2, 500, when: fn ($e, $res) => $res === null || $res->serverError(), throw: false)
```

---

## P2-11 · `MqttListen` melakukan subscribe ulang tanpa memutus koneksi lama

**Berkas:** [backend/app/Console/Commands/MqttListen.php:20-34](backend/app/Console/Commands/MqttListen.php#L20-L34)

Loop reconnect memanggil `MQTT::connection()` lalu `subscribe()` lagi di setiap iterasi, tanpa `disconnect()` pada koneksi lama. `MQTT::connection()` mengembalikan instance yang di-cache facade, jadi setelah error yang tidak memutus soket sepenuhnya, subscription bisa terdaftar berkali-kali pada handler yang sama — menghasilkan job ganda per pesan, yang berarti baris duplikat di `fill_snapshots` dan `sort_logs`.

Idenya benar (dan sudah lebih baik dari firmware, lihat P1-3); yang kurang hanya pembersihan.

**Perbaikan:** panggil `$mqtt->disconnect()` di blok `catch` sebelum `sleep(5)`, dan bungkus dalam `try/catch` sendiri agar kegagalan disconnect tidak menghentikan loop.

---

## P2-12 · `.env` frontend admin ter-commit, dan `.env.example` backend default-nya `APP_DEBUG=true`

**Berkas:** `frontend/.env` (tracked), [backend/.env.example:4](backend/.env.example#L4)

`frontend/.env` ada di dalam repositori. Isinya saat ini tidak sensitif (`VITE_API_URL=http://localhost:8000/api`, identik dengan `.env.example`-nya), jadi ini bukan kebocoran — tapi polanya berbahaya: berkas itu adalah tempat rahasia akan ditambahkan nanti, dan ia sudah dalam keadaan ter-track. Direktori lain menanganinya dengan benar (`frontend-kiosk/.env` dan `cv-service-fastapi/.env` keduanya ter-gitignore).

Terpisah dari itu, `.env.example` backend menetapkan `APP_DEBUG=true` dan `APP_ENV=local`. Ini default bawaan Laravel, tapi karena belum ada templat produksi (P1-7), deployment pertama yang menyalin berkas ini akan menyajikan stack trace lengkap — termasuk kredensial database — pada setiap error 500.

**Perbaikan:** `git rm --cached frontend/.env`, tambahkan `.env` ke `frontend/.gitignore`, dan sediakan `.env.production.example` dengan `APP_DEBUG=false`, `APP_ENV=production`, `LOG_LEVEL=warning`.

---

## P2-13 · CV service memproses gambar tanpa batas dimensi piksel

**Berkas:** [cv-service-fastapi/app/main.py:55-73](cv-service-fastapi/app/main.py#L55-L73)

Batasnya diterapkan pada byte terkompresi:

```python
if len(raw) > settings.cv_max_image_mb * 1024 * 1024:
```

Lalu `image.load()` mendekode gambarnya. PNG 5 MB bisa berkembang menjadi puluhan gigabyte piksel — serangan decompression bomb klasik. Pillow memang punya `MAX_IMAGE_PIXELS` bawaan (~178 juta piksel) yang memberi sebagian perlindungan, tapi ambangnya jauh di atas apa pun yang layanan ini butuhkan, dan kiosk hanya pernah mengirim frame 640 px.

**Perbaikan:** set `Image.MAX_IMAGE_PIXELS` ke nilai yang wajar (mis. 40 juta) dan periksa `image.size` sebelum `load()`, tolak dengan 422 bila melebihi.

---

# ⚪ P3 — RENDAH / SEPELE

| # | Temuan | Berkas | Catatan |
|---|---|---|---|
| P3-1 | **Bagian §13 README hilang.** Daftar isi menautkan "13. Dokumentasi Lanjutan" tapi isinya tidak ada — dokumen berakhir di §12. Anchor-nya rusak. | [README.md:23](README.md#L23) | Kemungkinan besar bagian yang menautkan `docs/` yang di-gitignore (P1-8) |
| P3-2 | **Tiga endpoint ingest kiosk tidak terdokumentasi.** Tabel API §9 mencantumkan `/cv/classify` tapi melewatkan `/units/{code}/fill`, `/sort-logs`, dan `/heartbeat` — padahal ketiganya jalur data utama dari perangkat | [README.md](README.md), [routes/api.php:23-27](backend/routes/api.php#L23-L27) | |
| P3-3 | **20 `console.log` beremoji di jalur produksi kiosk.** 11 di `KioskProvider`, 9 di `useRealtimeDetection` — beberapa di dalam loop deteksi 5 fps, mencatat panjang tiap frame | [KioskProvider.tsx](frontend-kiosk/src/context/KioskProvider.tsx), [useRealtimeDetection.ts](frontend-kiosk/src/hooks/useRealtimeDetection.ts) | Ganti dengan logger yang bisa dimatikan lewat `config.debugPanel` |
| P3-4 | **`LABEL_TO_QUIZ` didefinisikan di dalam badan komponen**, dialokasikan ulang setiap render, dan `pickItem` menutupinya dengan dependency array kosong | [KioskProvider.tsx:249](frontend-kiosk/src/context/KioskProvider.tsx#L249) | Pindahkan ke module scope; tidak berbahaya sekarang tapi tepat bila nanti dinamis |
| P3-5 | **Artefak training ter-commit.** `runs/detect/bunnybin_v1/*.jpg` ≈ 1,5 MB gambar batch training di dalam repo, padahal `cv-service-fastapi/.gitignore` sudah punya aturan `runs/` — aturannya hanya tidak berlaku untuk `runs/` di root | [runs/detect/](runs/detect/) | Tambahkan `/runs/` ke `.gitignore` root |
| P3-6 | **`.git` berukuran 268 MB** untuk repositori berisi 267 berkas ter-track dengan blob terbesar 500 KB. Selisihnya berasal dari objek dangling — kemungkinan bobot model yang pernah di-stage lalu dihapus | — | `git reflog expire --expire=now --all && git gc --prune=now --aggressive` |
| P3-7 | **Penamaan campur pasca-rename.** Setelah `refactor: rename bunnybin to binexa`, `bunnybin` masih tersisa di: nama database & kredensial, `BunnyBin_ESP32.ino`, hostname mDNS `bunnybin.local`, nama project compose `bunnybin-dev`, dan `name` di `package.json` | banyak berkas | Kosmetik, tapi menyulitkan pencarian dan membingungkan kontributor baru |
| P3-8 | **Bug laten `distanceToPercent` firmware:** saat pembacaan gagal ia mengembalikan `organikPercent` untuk **kedua** sensor — anorganik akan mewarisi nilai organik. Saat ini tak terjangkau (pemanggilnya sudah menyaring `d > 0` lebih dulu), tapi ia menunggu pemanggil berikutnya | [BunnyBin_ESP32.ino:104-110](BunnyBin_ESP32.ino#L104-L110) | |
| P3-9 | **Firmware memblokir selama ~1,35 detik saat menyortir.** `sortTrash()` memakai `delay(900) + delay(450)`; selama itu `server.handleClient()` tidak berjalan dan sensor tidak terbaca | [BunnyBin_ESP32.ino:141-149](BunnyBin_ESP32.ino#L141-L149) | Disengaja (`RealEsp32Client` menaikkan timeout jadi 12 dtk dan menjelaskan alasannya), jadi ini catatan, bukan cacat |
| P3-10 | **Bentrok port dev.** README kiosk menyebut `localhost:5173`, tapi `config/cors.php` mengizinkan kiosk di `5174`; keduanya `vite.config.ts` tidak menetapkan port sehingga sama-sama default 5173. Menjalankan keduanya bersamaan menggeser satu ke 5174 secara kebetulan | [frontend-kiosk/README.md:24](frontend-kiosk/README.md#L24), [backend/config/cors.php:25](backend/config/cors.php#L25) | Tetapkan `server.port` eksplisit di kedua `vite.config.ts` |
| P3-11 | **`MaintenanceEvent` tanpa endpoint tulis.** Model, migration, relasi, dan field di `UnitResource` semuanya ada, tapi satu-satunya yang membuat baris adalah `SimulateDevices`. Admin tidak bisa mencatat pengosongan tong lewat API | [MaintenanceEvent.php](backend/app/Models/MaintenanceEvent.php), [UnitResource.php:38](backend/app/Http/Resources/UnitResource.php#L38) | Fitur setengah jalan — selesaikan atau tandai sebagai belum diimplementasi |
| P3-12 | **Cache dashboard tidak diinvalidasi.** `Cache::remember(..., 30, ...)` berarti unit yang baru dibuat/dihapus tidak muncul selama 30 detik. Frontend sudah polling tiap 30 detik, jadi jendela terburuknya 60 detik | [DashboardController.php:21](backend/app/Http/Controllers/Api/DashboardController.php#L21) | Dapat diterima; invalidasi pada mutasi unit bila terasa mengganggu |
| P3-13 | **Kiosk tidak punya konfigurasi oxlint.** `frontend/` punya `.oxlintrc.json` yang mengaktifkan `react/rules-of-hooks` sebagai error; `frontend-kiosk/` tidak punya — sehingga `npm run lint` di sana berjalan dengan aturan default dan melaporkan nol temuan, termasuk pada pola hook yang dicatat di P3-4 | `frontend-kiosk/` | Salin `.oxlintrc.json` dari `frontend/` |
| P3-14 | **Berkas turunan ter-commit.** `frontend-kiosk/tsconfig.app.tsbuildinfo` dan `tsconfig.node.tsbuildinfo` ada di repo; `.vscode/settings.json` ter-commit hanya berisi `{}` | — | Tambahkan `*.tsbuildinfo` ke `.gitignore` |

---

# Peta Jalan Perbaikan

Diurutkan berdasarkan rasio dampak terhadap usaha, bukan sekadar nomor prioritas.

### Segera (hari ini — hitungan menit hingga jam)

1. **Ganti password WiFi** (P0-1) — satu operasi jaringan, menutup risiko terbesar
2. **Cabut & terbitkan ulang token kiosk** (P0-3) — `php artisan unit:token BNX-001`
3. **Aktifkan throttling** (P0-4) — dua baris: `$middleware->throttleApi()` + `throttle:5,1` di login
4. **Bind port MQTT ke localhost** (P0-2 parsial) — satu baris di compose, menutup akses jaringan sementara auth disiapkan

### Minggu ini

5. **Autentikasi MQTT dengan ACL per-unit** (P0-2) — password_file + ACL topik
6. **Perbaiki logika sortir kiosk** (P1-4) — servo mengikuti deteksi, bukan quiz item acak; ini fungsi inti produk
7. **Middleware `EnsureAdminUser`** (P1-1) — ubah empat 500 menjadi 403 yang disengaja
8. **Persist antrean retry ke localStorage** (P1-6) — hentikan kehilangan data sortiran
9. **Commit `docs/`** (P1-8) — satu baris `.gitignore`, mengembalikan separuh konteks proyek
10. **Bersihkan riwayat git dari kredensial** (P0-1) — `git filter-repo`, murah pada 19 commit

### Dua minggu ke depan

11. **CI dasar** (P1-7) — tiga job; mengunci semua perbaikan di atas agar tidak berbalik
12. **Baca `fill_hourly`, selaraskan retensi** (P1-5) — sebelum data 90 hari pertama terhapus
13. **Perbaiki pelaporan kegagalan sensor firmware** (P1-2) + **reconnect WiFi** (P1-3) — memerlukan pencairan pembekuan firmware
14. **Perbaiki `LABEL_TO_QUIZ`** (P2-3) — melengkapi perbaikan P1-4
15. **Test untuk `kioskReducer`, `toCloudError`, `pickItem`, `RealEsp32Client`** (P2-7)

### Sebelum penempatan di sekolah

16. Compose produksi + Dockerfile + `APP_DEBUG=false` (P1-7, P2-12)
17. Matriks CI PostgreSQL/TimescaleDB (P2-6)
18. Autentikasi CV service (P2-2), auth ESP32 `/api/sort` (P2-9)
19. Validasi rentang timestamp (P2-1), perbaikan dedup alert (P2-5)

---

# Yang Sudah Berjalan Baik

Adil untuk mencatat ini, karena beberapa keputusan di sini secara aktif mencegah kelas bug yang lebih besar:

- **`DeviceIngestService` sebagai titik konversi tunggal.** Komentar pembukanya menjelaskan tepatnya kenapa duplikasi akan menyakitkan, dan (dengan pengecualian P2-4) aturan itu dipegang. Jalur MQTT dan HTTP benar-benar menghasilkan baris yang identik.
- **Konversi jarak→persen di backend, bukan firmware.** Kalibrasi tong bisa diubah dari dashboard tanpa flash ulang — keputusan arsitektur yang tepat, dan alasannya terdokumentasi di `Unit::fillPctFromDistance()` lengkap dengan diagram ASCII.
- **`RealEsp32Client` sebagai penerjemah tunggal.** Menahan penamaan bahasa Indonesia firmware agar tidak merembes ke skema database, dengan komentar yang menyatakan konsekuensinya bila bocor.
- **`EnsureKioskUnit`.** Memeriksa jenis pemanggil *dan* kepemilikan unit — persis pengecekan yang hilang di jalur MQTT. Polanya sudah benar; ia hanya belum diterapkan di mana-mana.
- **Klasifikasi error retryable vs permanen** di `errors.ts`, dengan komentar yang mencatat kejadian kehilangan data 419 yang melahirkannya. Ini pengetahuan institusional yang tertulis di tempat yang tepat.
- **Seeder yang menolak memalsukan data.** Komentar yang menjelaskan kenapa 96 snapshot palsu dihapus ("Dashboard yang kosong di awal adalah harga yang benar untuk dibayar") menunjukkan disiplin yang tidak umum.
- **Migration yang tahan tanpa TimescaleDB.** Setiap operasi hypertable dijaga guard, dengan profil compose `postgres-plain` khusus untuk mengujinya — infrastruktur pengujiannya sudah ada, tinggal dijalankan.
- **Fail-fast di `YoloClassifier`.** Bobot tidak ditemukan → error, bukan fallback senyap ke dummy. Sikap yang benar untuk layanan inferensi.
- **96 test hijau** di tiga bahasa, dengan nama test yang menjelaskan perilaku, bukan implementasi (*"it treats a dead sensor as a fault instead of an empty bin"*).

Pola yang berulang di seluruh temuan di atas: **proyek ini biasanya sudah tahu hal yang benar dan sudah menuliskannya** — di komentar, di guard, di satu sisi dari dua jalur yang setara. Sebagian besar perbaikan bukan tentang merancang sesuatu yang baru, melainkan menerapkan aturan yang sudah dirumuskan sendiri ke tempat yang terlewat.
