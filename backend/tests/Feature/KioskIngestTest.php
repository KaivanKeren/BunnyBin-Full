<?php

use App\Models\AdminUser;
use App\Models\Alert;
use App\Models\QuizItem;
use App\Models\School;
use App\Models\Unit;
use Laravel\Sanctum\Sanctum;

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

function actingAsUnit(Unit $unit): void
{
    Sanctum::actingAs($unit, ['kiosk']);
}

it('stores a fill snapshot from relayed distances and returns backend percentages', function () {
    actingAsUnit($this->unit);

    // 35 cm dari sensor = 30 cm terisi dari tinggi 60 cm = 50%.
    $this->postJson('/api/units/BNB-001/fill', [
        'organic_distance_cm' => 35,
        'inorganic_distance_cm' => 20,
    ])
        ->assertOk()
        ->assertJson(['organic_pct' => 50, 'inorganic_pct' => 75]);

    $this->assertDatabaseHas('fill_snapshots', [
        'unit_id' => $this->unit->id,
        'organic_pct' => 50,
        'inorganic_pct' => 75,
    ]);

    expect($this->unit->refresh()->last_seen_at->diffInSeconds(now()))->toBeLessThan(5);
});

it('rejects an out-of-range reading and raises a sensor alert instead of storing it', function () {
    actingAsUnit($this->unit);

    $this->postJson('/api/units/BNB-001/fill', [
        'organic_distance_cm' => 300, // jauh di luar tong 65 cm → sensor bermasalah
        'inorganic_distance_cm' => 20,
    ])
        ->assertUnprocessable()
        ->assertJson(['error' => 'sensor_reading_rejected']);

    $this->assertDatabaseCount('fill_snapshots', 0);
    $this->assertDatabaseHas('alerts', [
        'unit_id' => $this->unit->id,
        'alert_type' => Alert::TYPE_SENSOR_FAULT,
    ]);
});

it('stores a sort log posted by the kiosk', function () {
    actingAsUnit($this->unit);
    $quizItem = QuizItem::factory()->create(['category' => 'organic']);

    $this->postJson('/api/units/BNB-001/sort-logs', [
        'quiz_item_id' => $quizItem->id,
        'category_detected' => 'organic',
        'confidence' => 0.91,
        'is_correct' => true,
    ])->assertCreated();

    $this->assertDatabaseHas('sort_logs', [
        'unit_id' => $this->unit->id,
        'quiz_item_id' => $quizItem->id,
        'category_detected' => 'organic',
        'is_correct' => true,
    ]);
});

it('accepts a sort log without a detected category when CV was unavailable', function () {
    actingAsUnit($this->unit);
    $quizItem = QuizItem::factory()->create(['category' => 'inorganic']);

    $this->postJson('/api/units/BNB-001/sort-logs', [
        'quiz_item_id' => $quizItem->id,
        'category_detected' => null,
        'confidence' => null,
        'is_correct' => false,
    ])->assertCreated();

    // Jawaban anak tetap tercatat walau CV gagal — itu justru datanya.
    $this->assertDatabaseHas('sort_logs', [
        'unit_id' => $this->unit->id,
        'quiz_item_id' => $quizItem->id,
        'category_detected' => null,
        'is_correct' => false,
    ]);
});

it('records the kiosk timestamp so queued logs land at the time they happened', function () {
    actingAsUnit($this->unit);
    $quizItem = QuizItem::factory()->create(['category' => 'organic']);
    $happenedAt = now()->subMinutes(20);

    $this->postJson('/api/units/BNB-001/sort-logs', [
        'quiz_item_id' => $quizItem->id,
        'category_detected' => 'organic',
        'is_correct' => true,
        'ts' => $happenedAt->toIso8601String(),
    ])->assertCreated();

    expect($this->unit->sortLogs()->sole()->created_at->diffInSeconds($happenedAt))->toBeLessThan(2);
});

it('brings an offline unit back online on heartbeat', function () {
    $this->unit->update(['status' => Unit::STATUS_OFFLINE]);
    actingAsUnit($this->unit);

    $this->postJson('/api/units/BNB-001/heartbeat')
        ->assertOk()
        ->assertJson(['status' => Unit::STATUS_ACTIVE]);

    expect($this->unit->refresh()->status)->toBe(Unit::STATUS_ACTIVE);
});

it('forbids a unit token from writing to another unit', function () {
    $other = Unit::factory()->create([
        'school_id' => School::factory()->create()->id,
        'code' => 'BNB-002',
    ]);
    actingAsUnit($this->unit);

    $this->postJson('/api/units/BNB-002/fill', [
        'organic_distance_cm' => 35,
        'inorganic_distance_cm' => 20,
    ])->assertForbidden();

    expect($other->fillSnapshots()->count())->toBe(0);
});

it('rejects callers that are not kiosk unit tokens', function () {
    $payload = ['organic_distance_cm' => 35, 'inorganic_distance_cm' => 20];

    // Tanpa auth sama sekali
    $this->postJson('/api/units/BNB-001/fill', $payload)->assertUnauthorized();

    // Session admin lolos auth:sanctum tapi bukan device — harus ditolak.
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->postJson('/api/units/BNB-001/fill', $payload)
        ->assertForbidden();

    // Token unit yang abilitynya bukan 'kiosk' (mis. token diagnostik)
    Sanctum::actingAs($this->unit, ['diagnostics']);
    $this->postJson('/api/units/BNB-001/fill', $payload)->assertForbidden();

    $this->assertDatabaseCount('fill_snapshots', 0);
});

it('requires either a distance or a percentage per compartment', function () {
    actingAsUnit($this->unit);

    $this->postJson('/api/units/BNB-001/fill', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['organic_distance_cm', 'inorganic_distance_cm']);
});
