<?php

use App\Models\AdminUser;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;

beforeEach(function () {
    $this->schoolA = School::factory()->create();
    $schoolB = School::factory()->create();
    $this->unitA1 = Unit::factory()->create(['school_id' => $this->schoolA->id]);
    $this->unitA2 = Unit::factory()->create(['school_id' => $this->schoolA->id]);
    $unitB = Unit::factory()->create(['school_id' => $schoolB->id]);

    SortLog::create(['unit_id' => $this->unitA1->id, 'category_detected' => 'organic', 'is_correct' => true, 'created_at' => now()]);
    SortLog::create(['unit_id' => $this->unitA1->id, 'category_detected' => 'organic', 'is_correct' => false, 'created_at' => now()->subHour()]);
    SortLog::create(['unit_id' => $this->unitA2->id, 'category_detected' => 'inorganic', 'is_correct' => true, 'created_at' => now()->subDays(10)]);
    SortLog::create(['unit_id' => $unitB->id, 'category_detected' => 'organic', 'is_correct' => true, 'created_at' => now()]);
});

it('returns cross-unit sort logs scoped to the admin school with accuracy summary', function () {
    $response = $this->actingAs(AdminUser::factory()->create(['school_id' => $this->schoolA->id]))
        ->getJson('/api/sort-logs')
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonPath('summary.total_scored', 3)
        ->assertJsonPath('summary.correct', 2)
        ->assertJsonPath('summary.accuracy', 66.7);

    expect(collect($response->json('data'))->pluck('unit.code'))
        ->not->toContain(null);
});

it('filters by unit, is_correct, and date range with matching summary', function () {
    $admin = AdminUser::factory()->create(['school_id' => $this->schoolA->id]);

    $this->actingAs($admin)
        ->getJson("/api/sort-logs?unit_id={$this->unitA1->id}")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('summary.accuracy', 50);

    $this->actingAs($admin)
        ->getJson('/api/sort-logs?is_correct=0')
        ->assertOk()
        ->assertJsonCount(1, 'data');

    $this->actingAs($admin)
        ->getJson('/api/sort-logs?from='.now()->subDay()->toDateString())
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('super_admin sees logs from all schools', function () {
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/sort-logs')
        ->assertOk()
        ->assertJsonCount(4, 'data')
        ->assertJsonPath('summary.total_scored', 4);
});
