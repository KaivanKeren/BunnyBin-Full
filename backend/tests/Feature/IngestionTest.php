<?php

use App\Jobs\ProcessSensorReading;
use App\Models\Alert;
use App\Models\School;
use App\Models\Unit;
use App\Services\AlertEngineService;
use App\Services\DeviceIngestService;

beforeEach(function () {
    // Geometri eksplisit: kosong terbaca 65 cm, penuh 5 cm, 1 cm = 1.667%.
    $this->unit = Unit::factory()->create([
        'school_id' => School::factory()->create()->id,
        'code' => 'BNB-001',
        'last_seen_at' => now()->subHour(),
        'bin_height_cm' => 60,
        'sensor_offset_cm' => 5,
    ]);
});

function dispatchReading(string $channel, array $payload, string $code = 'BNB-001'): void
{
    (new ProcessSensorReading($code, $channel, $payload))->handle(app(DeviceIngestService::class));
}

it('stores fill snapshot and touches last_seen_at on sensor message', function () {
    dispatchReading('sensor', ['organic_pct' => 42, 'inorganic_pct' => 68]);

    $this->assertDatabaseHas('fill_snapshots', [
        'unit_id' => $this->unit->id,
        'organic_pct' => 42,
        'inorganic_pct' => 68,
    ]);

    expect($this->unit->refresh()->last_seen_at->diffInSeconds(now()))->toBeLessThan(5);
});

it('creates fill_70 alert at 70 percent and fill_90 at 90 percent', function () {
    dispatchReading('sensor', ['organic_pct' => 75, 'inorganic_pct' => 30]);

    $this->assertDatabaseHas('alerts', ['unit_id' => $this->unit->id, 'alert_type' => Alert::TYPE_FILL_70]);
    expect(Alert::count())->toBe(1);

    dispatchReading('sensor', ['organic_pct' => 75, 'inorganic_pct' => 95]);

    $this->assertDatabaseHas('alerts', ['unit_id' => $this->unit->id, 'alert_type' => Alert::TYPE_FILL_90]);
});

it('deduplicates alerts of the same type within one hour', function () {
    dispatchReading('sensor', ['organic_pct' => 75, 'inorganic_pct' => 30]);
    dispatchReading('sensor', ['organic_pct' => 80, 'inorganic_pct' => 30]);

    expect(Alert::where('alert_type', Alert::TYPE_FILL_70)->count())->toBe(1);
});

it('creates a new alert after the previous one is read', function () {
    dispatchReading('sensor', ['organic_pct' => 75, 'inorganic_pct' => 30]);
    Alert::query()->update(['is_read' => true]);

    dispatchReading('sensor', ['organic_pct' => 80, 'inorganic_pct' => 30]);

    expect(Alert::where('alert_type', Alert::TYPE_FILL_70)->count())->toBe(2);
});

it('converts raw ultrasonic distance to fill percent using unit geometry', function () {
    // 65 cm = kosong (0%), 35 cm = separuh (50%), 5 cm = penuh (100%)
    dispatchReading('sensor', ['organic_distance_cm' => 35, 'inorganic_distance_cm' => 65]);

    $this->assertDatabaseHas('fill_snapshots', [
        'unit_id' => $this->unit->id,
        'organic_pct' => 50,
        'inorganic_pct' => 0,
        'organic_distance_cm' => 35.0,
        'inorganic_distance_cm' => 65.0,
    ]);
});

it('clamps distance slightly outside the theoretical range', function () {
    // 3 cm masih dalam toleransi di atas "penuh" (5 cm) → 100%, bukan >100
    dispatchReading('sensor', ['organic_distance_cm' => 3, 'inorganic_distance_cm' => 70]);

    $this->assertDatabaseHas('fill_snapshots', [
        'unit_id' => $this->unit->id,
        'organic_pct' => 100,
        'inorganic_pct' => 0,
    ]);
});

it('recalculates percent when unit geometry changes', function () {
    $this->unit->update(['bin_height_cm' => 30, 'sensor_offset_cm' => 5]);

    // Tong lebih pendek: 20 cm kini = 50%, bukan 75% seperti pada tong 60 cm
    dispatchReading('sensor', ['organic_distance_cm' => 20, 'inorganic_distance_cm' => 20]);

    $this->assertDatabaseHas('fill_snapshots', [
        'unit_id' => $this->unit->id,
        'organic_pct' => 50,
    ]);
});

it('raises a sensor_fault alert and stores nothing when distance is out of range', function () {
    // Echo hilang → jarak jauh melebihi tinggi tong + toleransi
    dispatchReading('sensor', ['organic_distance_cm' => 250, 'inorganic_distance_cm' => 30]);

    $this->assertDatabaseCount('fill_snapshots', 0);
    $this->assertDatabaseHas('alerts', [
        'unit_id' => $this->unit->id,
        'alert_type' => Alert::TYPE_SENSOR_FAULT,
    ]);
});

it('treats a dead sensor as a fault instead of an empty bin', function () {
    // 0 cm = di bawah batas fisik HC-SR04, bukan "penuh"
    dispatchReading('sensor', ['organic_distance_cm' => 0, 'inorganic_distance_cm' => 30]);

    $this->assertDatabaseCount('fill_snapshots', 0);
    expect(Alert::where('alert_type', Alert::TYPE_SENSOR_FAULT)->count())->toBe(1);
});

it('deduplicates sensor_fault alerts within one hour', function () {
    dispatchReading('sensor', ['organic_distance_cm' => 250, 'inorganic_distance_cm' => 30]);
    dispatchReading('sensor', ['organic_distance_cm' => 260, 'inorganic_distance_cm' => 30]);

    expect(Alert::where('alert_type', Alert::TYPE_SENSOR_FAULT)->count())->toBe(1);
});

it('still accepts legacy percent payloads with null distance', function () {
    dispatchReading('sensor', ['organic_pct' => 42, 'inorganic_pct' => 68]);

    $this->assertDatabaseHas('fill_snapshots', [
        'unit_id' => $this->unit->id,
        'organic_pct' => 42,
        'organic_distance_cm' => null,
        'inorganic_distance_cm' => null,
    ]);
});

it('triggers fill alerts from distance-derived percentages', function () {
    // 11 cm → 90% terisi
    dispatchReading('sensor', ['organic_distance_cm' => 11, 'inorganic_distance_cm' => 60]);

    $this->assertDatabaseHas('alerts', [
        'unit_id' => $this->unit->id,
        'alert_type' => Alert::TYPE_FILL_90,
    ]);
});

it('skips invalid sensor payload without crashing', function () {
    dispatchReading('sensor', ['organic_pct' => 150, 'inorganic_pct' => 30]);
    dispatchReading('sensor', ['organic_pct' => 'abc']);

    $this->assertDatabaseCount('fill_snapshots', 0);
    $this->assertDatabaseCount('alerts', 0);
});

it('ignores unknown unit codes without throwing', function () {
    dispatchReading('sensor', ['organic_pct' => 42, 'inorganic_pct' => 68], 'BNB-999');

    $this->assertDatabaseCount('fill_snapshots', 0);
});

it('stores sort log from sort message', function () {
    dispatchReading('sort', ['category' => 'organic']);

    $this->assertDatabaseHas('sort_logs', [
        'unit_id' => $this->unit->id,
        'category_detected' => 'organic',
        'is_correct' => null,
        'quiz_item_id' => null,
    ]);
});

it('rejects sort message with invalid category', function () {
    dispatchReading('sort', ['category' => 'logam']);

    $this->assertDatabaseCount('sort_logs', 0);
});

it('restores offline unit to active on heartbeat', function () {
    $this->unit->update(['status' => Unit::STATUS_OFFLINE]);

    dispatchReading('heartbeat', ['status' => 'online']);

    expect($this->unit->refresh()->status)->toBe(Unit::STATUS_ACTIVE);
});

it('sweepOffline marks silent units offline and creates alert', function () {
    $this->unit->update(['last_seen_at' => now()->subMinutes(20)]);
    $fresh = Unit::factory()->create(['school_id' => $this->unit->school_id, 'last_seen_at' => now()]);

    app(AlertEngineService::class)->sweepOffline();

    expect($this->unit->refresh()->status)->toBe(Unit::STATUS_OFFLINE)
        ->and($fresh->refresh()->status)->toBe(Unit::STATUS_ACTIVE);

    $this->assertDatabaseHas('alerts', ['unit_id' => $this->unit->id, 'alert_type' => Alert::TYPE_OFFLINE]);
    expect(Alert::where('unit_id', $fresh->id)->count())->toBe(0);
});

it('sweepOffline does not duplicate for already offline units', function () {
    $this->unit->update(['last_seen_at' => now()->subMinutes(20)]);

    app(AlertEngineService::class)->sweepOffline();
    app(AlertEngineService::class)->sweepOffline();

    expect(Alert::where('alert_type', Alert::TYPE_OFFLINE)->count())->toBe(1);
});
