<?php

use App\Models\AdminUser;
use App\Models\FillSnapshot;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;

beforeEach(function () {
    $this->schoolA = School::factory()->create(['name' => 'SDN 1 Kudus']);
    $this->schoolB = School::factory()->create(['name' => 'SDN 2 Pati']);
    $this->unitA = Unit::factory()->create(['school_id' => $this->schoolA->id, 'code' => 'BNB-001']);
    $this->unitB = Unit::factory()->create(['school_id' => $this->schoolB->id, 'code' => 'BNB-002']);
    $this->adminA = AdminUser::factory()->create(['school_id' => $this->schoolA->id]);
});

it('school_admin only sees units of their own school', function () {
    $this->actingAs($this->adminA)
        ->getJson('/api/units')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.code', 'BNB-001');
});

it('school_admin cannot view another school unit detail', function () {
    $this->actingAs($this->adminA)
        ->getJson("/api/units/{$this->unitB->id}")
        ->assertNotFound();
});

it('school_admin cannot access fill-history or sort-logs of another school unit', function () {
    FillSnapshot::create(['unit_id' => $this->unitB->id, 'organic_pct' => 50, 'inorganic_pct' => 50]);
    SortLog::create(['unit_id' => $this->unitB->id, 'category_detected' => 'organic', 'is_correct' => true]);

    $this->actingAs($this->adminA)
        ->getJson("/api/units/{$this->unitB->id}/fill-history")
        ->assertNotFound();

    $this->actingAs($this->adminA)
        ->getJson("/api/units/{$this->unitB->id}/sort-logs")
        ->assertNotFound();
});

it('super_admin sees units of all schools', function () {
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/units')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});
