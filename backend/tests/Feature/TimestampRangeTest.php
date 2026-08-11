<?php

use App\Jobs\ProcessSensorReading;
use App\Models\FillSnapshot;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;
use Illuminate\Support\Facades\Log;
use Laravel\Sanctum\Sanctum;

/**
 * `recorded_at` dan `created_at` adalah kolom PARTISI hypertable TimescaleDB.
 * Satu baris bertanggal 2099 memaksa chunk di luar rentang normal, membuat
 * grafik ter-skala habis oleh satu outlier, dan bisa membuat kebijakan retensi
 * berperilaku tak terduga.
 *
 * Aturan yang dikunci di sini: ts di luar rentang wajar DINORMALISASI ke waktu
 * server, tidak ditolak. Penyebab paling mungkin bukan serangan melainkan
 * tablet yang jam sistemnya belum sinkron NTP setelah reboot — dan menolaknya
 * dengan 422 membuat kiosk MEMBUANG payload selamanya (422 tidak termasuk
 * RETRYABLE_STATUSES di api/errors.ts), sehingga sortiran anak hilang gara-gara
 * jam yang salah.
 */
beforeEach(function () {
    $this->unit = Unit::factory()->for(School::factory())->create(['code' => 'BNX-001']);
});

function postFill(Tests\TestCase $test, Unit $unit, string $ts): Illuminate\Testing\TestResponse
{
    Sanctum::actingAs($unit, ['kiosk']);

    return $test->postJson("/api/units/{$unit->code}/fill", [
        'organic_distance_cm' => 27.5,
        'inorganic_distance_cm' => 27.5,
        'ts' => $ts,
    ]);
}

it('clamps an absurd future timestamp instead of writing it', function () {
    postFill($this, $this->unit, '2099-01-01T00:00:00Z')->assertOk();

    // Datanya TERSIMPAN — itu intinya — tapi dengan waktu server.
    $snapshot = FillSnapshot::sole();
    expect($snapshot->recorded_at->year)->toBe(now()->year)
        ->and($snapshot->recorded_at->diffInMinutes(now()))->toBeLessThan(2);
});

it('clamps an absurd past timestamp instead of writing it', function () {
    postFill($this, $this->unit, '1970-01-01T00:00:00Z')->assertOk();

    expect(FillSnapshot::sole()->recorded_at->year)->toBe(now()->year);
});

it('preserves a legitimately delayed timestamp from the retry queue', function () {
    // Antrean retry kiosk bertahan melewati reboot dan menyimpan sampai 500
    // entri, jadi log yang sah bisa tiba berhari-hari terlambat. Memangkasnya
    // ke now() akan memindahkan sortiran anak ke hari yang salah.
    $tigaHariLalu = now()->subDays(3);

    postFill($this, $this->unit, $tigaHariLalu->toIso8601String())->assertOk();

    expect(FillSnapshot::sole()->recorded_at->toDateString())
        ->toBe($tigaHariLalu->toDateString());
});

it('tolerates small clock skew into the future', function () {
    // Selisih jam wajar antar-mesin tidak boleh memicu normalisasi.
    $duaMenitLagi = now()->addMinutes(2);

    postFill($this, $this->unit, $duaMenitLagi->toIso8601String())->assertOk();

    expect(FillSnapshot::sole()->recorded_at->diffInSeconds($duaMenitLagi))->toBeLessThan(2);
});

it('records the skew in the log so a broken clock stays visible', function () {
    // Menormalisasi diam-diam berarti jam yang rusak tidak pernah diperbaiki
    // siapa pun; kiosk terlihat sehat sementara seluruh waktunya salah.
    Log::spy();

    postFill($this, $this->unit, '2099-01-01T00:00:00Z')->assertOk();

    Log::shouldHaveReceived('warning')
        ->withArgs(fn (string $message) => str_contains($message, 'ts di luar rentang wajar'))
        ->once();
});

it('clamps on the MQTT path too, which never passes through a FormRequest', function () {
    // Jalur MQTT tidak punya validasi request sama sekali — payloadnya langsung
    // dari nama topik ke service. Kalau normalisasinya hanya dipasang di
    // controller HTTP, pintu ini tetap terbuka lebar.
    ProcessSensorReading::dispatchSync('BNX-001', 'sensor', [
        'organic_distance_cm' => 27.5,
        'inorganic_distance_cm' => 27.5,
        'ts' => '2099-01-01T00:00:00Z',
    ]);

    expect(FillSnapshot::sole()->recorded_at->year)->toBe(now()->year);
});

it('clamps sort log timestamps as well as fill snapshots', function () {
    Sanctum::actingAs($this->unit, ['kiosk']);

    $this->postJson("/api/units/{$this->unit->code}/sort-logs", [
        'category_detected' => 'organic',
        'is_correct' => true,
        'ts' => '2099-01-01T00:00:00Z',
    ])->assertCreated();

    expect(SortLog::sole()->created_at->year)->toBe(now()->year);
});

it('falls back to server time when ts cannot be parsed at all', function () {
    // Jalur MQTT: string sampah tidak lewat validasi 'date' mana pun.
    ProcessSensorReading::dispatchSync('BNX-001', 'sensor', [
        'organic_distance_cm' => 27.5,
        'inorganic_distance_cm' => 27.5,
        'ts' => 'bukan-tanggal',
    ]);

    expect(FillSnapshot::sole()->recorded_at->year)->toBe(now()->year);
});
