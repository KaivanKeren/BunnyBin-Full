<?php

use App\Models\AdminUser;
use App\Models\FillSnapshot;
use App\Models\School;
use App\Models\Unit;
use Illuminate\Support\Carbon;

/**
 * Mengunci dari MANA data fill-history berasal, dan batas rentangnya.
 *
 * Suite ini berjalan di SQLite, jadi yang teruji di sini adalah JALUR FALLBACK.
 * Jalur TimescaleDB (membaca continuous aggregate `fill_hourly`) diverifikasi
 * manual terhadap TimescaleDB 2.28 dan akan tercakup otomatis setelah task 5.2
 * memasang matriks CI pgsql. Hasil verifikasi manualnya:
 *
 *   - Sebelum perbaikan: view mengembalikan 1 bucket, agregasi mentah 6.
 *   - Setelah perbaikan (materialized_only=false + start_offset 7 hari +
 *     backfill): 6 dan 6, nilainya identik.
 *   - Setelah 20 dari 31 baris mentah dihapus (simulasi retensi 90 hari):
 *     endpoint hourly TETAP mengembalikan 6 bucket, raw tinggal 11 titik.
 *
 * Poin terakhir itulah inti P1-5: sebelum perbaikan, grafik jangka panjang ikut
 * menyusut bersama data mentah yang dihapus retensi.
 */
beforeEach(function () {
    $this->school = School::factory()->create();
    $this->superAdmin = AdminUser::factory()->superAdmin()->create();
    $this->unit = Unit::factory()->create(['school_id' => $this->school->id]);
});

it('serves hourly data without touching Postgres catalogs on other drivers', function () {
    // Regresi langsung: `timescaleAvailable()` menanyakan `pg_extension` tanpa
    // memeriksa driver. Pemanggil lama menjaganya dari luar; pemanggil baru
    // tidak — dan SELURUH endpoint balas 500 di SQLite dengan
    // "no such table: pg_extension". Penjagaannya kini ada di dalam fungsi itu.
    FillSnapshot::create([
        'unit_id' => $this->unit->id,
        'organic_pct' => 40,
        'inorganic_pct' => 50,
        'recorded_at' => Carbon::parse('2026-07-10 10:00:00'),
    ]);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$this->unit->id}/fill-history?interval=hourly&from=2026-07-10&to=2026-07-11")
        ->assertOk()
        ->assertJsonPath('interval', 'hourly');
});

it('keeps the hourly response contract stable across data sources', function () {
    // Nama kolom continuous aggregate BERBEDA dari kontrak API (`avg_organic`
    // vs `avg_organic_pct`). Kalau alias di controller hilang, frontend
    // menerima undefined dan grafiknya kosong tanpa error apa pun —
    // kegagalan senyap yang hanya terlihat sebagai chart datar.
    FillSnapshot::create([
        'unit_id' => $this->unit->id,
        'organic_pct' => 40,
        'inorganic_pct' => 50,
        'recorded_at' => Carbon::parse('2026-07-10 10:00:00'),
    ]);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$this->unit->id}/fill-history?interval=hourly&from=2026-07-10&to=2026-07-11")
        ->assertOk()
        ->assertJsonStructure([
            'unit_id', 'interval', 'from', 'to',
            'data' => [['bucket', 'avg_organic_pct', 'avg_inorganic_pct']],
        ]);
});

it('allows an hourly range far beyond the 90-day raw retention', function () {
    // Inti P1-5: rentang setahun harus DITERIMA, karena agregatnya bertahan
    // melewati retensi data mentah. Sebelumnya rentang ini juga diterima, tapi
    // datanya diambil dari tabel yang sudah dikosongkan retensi — diterima,
    // lalu mengembalikan array kosong tanpa penjelasan.
    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$this->unit->id}/fill-history?interval=hourly&from=2026-01-01&to=2026-12-01")
        ->assertOk()
        ->assertJsonPath('interval', 'hourly');
});

it('still caps raw range at 31 days as a payload guard', function () {
    // SENGAJA tidak dinaikkan ke 90 hari meski datanya ada: 90 hari pembacaan
    // tiap 30 menit ≈ 4.300 titik per unit, dan interval hourly memang ada
    // untuk rentang panjang.
    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$this->unit->id}/fill-history?interval=raw&from=2026-01-01&to=2026-03-01")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from');
});

it('rejects an hourly range longer than a year', function () {
    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$this->unit->id}/fill-history?interval=hourly&from=2024-01-01&to=2026-01-01")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from');
});
