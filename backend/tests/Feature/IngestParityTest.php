<?php

use App\Jobs\ProcessSensorReading;
use App\Models\Alert;
use App\Models\FillSnapshot;
use App\Models\QuizItem;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;
use Laravel\Sanctum\Sanctum;

/**
 * Menguji janji yang ditulis `DeviceIngestService` di komentar pembukanya:
 *
 *   "Dipakai dua pintu masuk yang HARUS BERPERILAKU IDENTIK... Kalau logika ini
 *    disalin ke masing-masing pintu, konversi jarak→persen dan aturan alert akan
 *    bergeser diam-diam di antara keduanya, dan angka di kiosk berbeda dengan
 *    angka di dashboard admin."
 *
 * Janji itu sebelumnya hanya dijaga oleh disiplin. Test di sini membandingkan
 * BARIS HASILNYA secara langsung — MQTT vs HTTP untuk payload setara — sehingga
 * pergeseran apa pun di antara keduanya langsung terlihat, bukan ditemukan
 * berbulan-bulan kemudian sebagai "angka di kiosk beda dengan dashboard".
 */
function unitUji(string $code): Unit
{
    return Unit::factory()->for(School::factory())->create([
        'code' => $code,
        'bin_height_cm' => 60,
        'sensor_offset_cm' => 5,
    ]);
}

/** Ambil kolom yang menentukan, tanpa id/unit_id yang memang pasti berbeda. */
function isiSnapshot(FillSnapshot $s): array
{
    return [
        'organic_pct' => $s->organic_pct,
        'inorganic_pct' => $s->inorganic_pct,
        'organic_distance_cm' => $s->organic_distance_cm,
        'inorganic_distance_cm' => $s->inorganic_distance_cm,
    ];
}

it('produces an identical fill snapshot from MQTT and HTTP', function () {
    $viaMqtt = unitUji('BNX-MQTT');
    $viaHttp = unitUji('BNX-HTTP');

    $payload = ['organic_distance_cm' => 35, 'inorganic_distance_cm' => 65];

    ProcessSensorReading::dispatchSync('BNX-MQTT', 'sensor', $payload);

    Sanctum::actingAs($viaHttp, ['kiosk']);
    $this->postJson('/api/units/BNX-HTTP/fill', $payload)->assertOk();

    $mqtt = FillSnapshot::where('unit_id', $viaMqtt->id)->sole();
    $http = FillSnapshot::where('unit_id', $viaHttp->id)->sole();

    expect(isiSnapshot($mqtt))->toBe(isiSnapshot($http))
        // Nilai konkretnya ikut dikunci: kalau geometri unit diabaikan salah
        // satu pintu, keduanya masih "identik" tapi sama-sama salah.
        ->and($mqtt->organic_pct)->toBe(50)
        ->and($mqtt->inorganic_pct)->toBe(0);
});

it('rejects an out-of-range reading identically on both doors', function () {
    $viaMqtt = unitUji('BNX-MQTT');
    $viaHttp = unitUji('BNX-HTTP');

    // 300 cm jauh di luar rentang tong 60 cm — sensor bermasalah, bukan data.
    $payload = ['organic_distance_cm' => 300, 'inorganic_distance_cm' => 30];

    ProcessSensorReading::dispatchSync('BNX-MQTT', 'sensor', $payload);

    Sanctum::actingAs($viaHttp, ['kiosk']);
    $this->postJson('/api/units/BNX-HTTP/fill', $payload)->assertStatus(422);

    // Tidak ada baris di kedua sisi, dan KEDUANYA memunculkan alert sensor.
    expect(FillSnapshot::count())->toBe(0)
        ->and(Alert::where('unit_id', $viaMqtt->id)->where('alert_type', Alert::TYPE_SENSOR_FAULT)->count())->toBe(1)
        ->and(Alert::where('unit_id', $viaHttp->id)->where('alert_type', Alert::TYPE_SENSOR_FAULT)->count())->toBe(1);
});

it('raises the same fill alerts from both doors', function () {
    $viaMqtt = unitUji('BNX-MQTT');
    $viaHttp = unitUji('BNX-HTTP');

    // 8 cm dari sensor pada tong 60 cm + offset 5 = 95% penuh.
    $payload = ['organic_distance_cm' => 8, 'inorganic_distance_cm' => 8];

    ProcessSensorReading::dispatchSync('BNX-MQTT', 'sensor', $payload);

    Sanctum::actingAs($viaHttp, ['kiosk']);
    $this->postJson('/api/units/BNX-HTTP/fill', $payload)->assertOk();

    $jenisMqtt = Alert::where('unit_id', $viaMqtt->id)->pluck('alert_type')->sort()->values()->all();
    $jenisHttp = Alert::where('unit_id', $viaHttp->id)->pluck('alert_type')->sort()->values()->all();

    expect($jenisMqtt)->toBe($jenisHttp)
        ->and($jenisMqtt)->toContain(Alert::TYPE_FILL_90);
});

it('produces an identical sort log from MQTT and HTTP', function () {
    $viaMqtt = unitUji('BNX-MQTT');
    $viaHttp = unitUji('BNX-HTTP');
    $quizItem = QuizItem::factory()->create(['category' => 'organic']);

    // Nama field berbeda antar pintu (MQTT: `category`, HTTP: `category_detected`)
    // — itulah justru terjemahan yang harus bertemu di titik yang sama.
    ProcessSensorReading::dispatchSync('BNX-MQTT', 'sort', [
        'category' => 'inorganic',
        'quiz_item_id' => $quizItem->id,
        'confidence' => 0.75,
    ]);

    Sanctum::actingAs($viaHttp, ['kiosk']);
    $this->postJson('/api/units/BNX-HTTP/sort-logs', [
        'category_detected' => 'inorganic',
        'quiz_item_id' => $quizItem->id,
        'confidence' => 0.75,
    ])->assertCreated();

    $mqtt = SortLog::where('unit_id', $viaMqtt->id)->sole();
    $http = SortLog::where('unit_id', $viaHttp->id)->sole();

    expect($mqtt->category_detected)->toBe($http->category_detected)
        ->and($mqtt->quiz_item_id)->toBe($http->quiz_item_id)
        ->and($mqtt->confidence)->toBe($http->confidence)
        // Penilaian otomatis (CV inorganic vs quiz organic = salah) harus sama.
        ->and($mqtt->is_correct)->toBe($http->is_correct)
        ->and($mqtt->is_correct)->toBeFalse();
});

it('marks the unit seen on both doors', function () {
    $viaMqtt = unitUji('BNX-MQTT');
    $viaHttp = unitUji('BNX-HTTP');

    $viaMqtt->forceFill(['status' => Unit::STATUS_OFFLINE, 'last_seen_at' => null])->save();
    $viaHttp->forceFill(['status' => Unit::STATUS_OFFLINE, 'last_seen_at' => null])->save();

    ProcessSensorReading::dispatchSync('BNX-MQTT', 'heartbeat', []);

    Sanctum::actingAs($viaHttp, ['kiosk']);
    $this->postJson('/api/units/BNX-HTTP/heartbeat')->assertOk();

    expect($viaMqtt->fresh()->status)->toBe(Unit::STATUS_ACTIVE)
        ->and($viaHttp->fresh()->status)->toBe(Unit::STATUS_ACTIVE)
        ->and($viaMqtt->fresh()->last_seen_at)->not->toBeNull()
        ->and($viaHttp->fresh()->last_seen_at)->not->toBeNull();
});
