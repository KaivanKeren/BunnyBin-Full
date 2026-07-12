<?php

use App\Models\AdminUser;
use App\Models\Alert;
use App\Models\School;
use App\Models\Unit;

beforeEach(function () {
    $this->schoolA = School::factory()->create();
    $schoolB = School::factory()->create();
    $this->unitA = Unit::factory()->create(['school_id' => $this->schoolA->id]);
    $unitB = Unit::factory()->create(['school_id' => $schoolB->id]);

    $this->alertA = Alert::create(['unit_id' => $this->unitA->id, 'alert_type' => 'fill_70', 'message' => 'A']);
    $this->alertB = Alert::create(['unit_id' => $unitB->id, 'alert_type' => 'fill_90', 'message' => 'B']);
});

it('school_admin only sees alerts of their own school', function () {
    $this->actingAs(AdminUser::factory()->create(['school_id' => $this->schoolA->id]))
        ->getJson('/api/alerts')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $this->alertA->id);
});

it('super_admin sees all alerts with unread filter', function () {
    $this->alertA->update(['is_read' => true]);

    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/alerts')
        ->assertOk()
        ->assertJsonCount(2, 'data');

    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/alerts?unread=1')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $this->alertB->id);
});

it('marks an alert as read', function () {
    $this->actingAs(AdminUser::factory()->create(['school_id' => $this->schoolA->id]))
        ->patchJson("/api/alerts/{$this->alertA->id}/read")
        ->assertOk()
        ->assertJsonPath('is_read', true);

    expect($this->alertA->refresh()->is_read)->toBeTrue();
});

it('school_admin cannot mark another school alert as read', function () {
    $this->actingAs(AdminUser::factory()->create(['school_id' => $this->schoolA->id]))
        ->patchJson("/api/alerts/{$this->alertB->id}/read")
        ->assertNotFound();

    expect($this->alertB->refresh()->is_read)->toBeFalse();
});
