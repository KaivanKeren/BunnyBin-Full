<?php

use App\Models\AdminUser;
use App\Models\FillSnapshot;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;
use Illuminate\Support\Carbon;

beforeEach(function () {
    $this->superAdmin = AdminUser::factory()->superAdmin()->create();
    $this->school = School::factory()->create();
});

it('super_admin can create a unit', function () {
    $this->actingAs($this->superAdmin)
        ->postJson('/api/units', [
            'school_id' => $this->school->id,
            'code' => 'BNB-100',
            'location_label' => 'Kantin',
        ])
        ->assertCreated()
        ->assertJsonPath('code', 'BNB-100')
        ->assertJsonPath('school.id', $this->school->id);

    $this->assertDatabaseHas('units', ['code' => 'BNB-100']);
});

it('rejects duplicate unit code', function () {
    Unit::factory()->create(['code' => 'BNB-100']);

    $this->actingAs($this->superAdmin)
        ->postJson('/api/units', ['school_id' => $this->school->id, 'code' => 'BNB-100'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('code');
});

it('school_admin cannot create, update, or delete units', function () {
    $admin = AdminUser::factory()->create(['school_id' => $this->school->id]);
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);

    $this->actingAs($admin)
        ->postJson('/api/units', ['school_id' => $this->school->id, 'code' => 'BNB-200'])
        ->assertForbidden();

    $this->actingAs($admin)
        ->putJson("/api/units/{$unit->id}", ['status' => 'maintenance'])
        ->assertForbidden();

    $this->actingAs($admin)
        ->deleteJson("/api/units/{$unit->id}")
        ->assertForbidden();
});

it('super_admin can update unit status and rejects invalid status', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);

    $this->actingAs($this->superAdmin)
        ->putJson("/api/units/{$unit->id}", ['status' => 'maintenance'])
        ->assertOk()
        ->assertJsonPath('status', 'maintenance');

    $this->actingAs($this->superAdmin)
        ->putJson("/api/units/{$unit->id}", ['status' => 'rusak'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('status');
});

it('super_admin can delete a unit', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);

    $this->actingAs($this->superAdmin)
        ->deleteJson("/api/units/{$unit->id}")
        ->assertNoContent();

    $this->assertDatabaseMissing('units', ['id' => $unit->id]);
});

it('unit detail includes latest fill snapshot', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 10, 'inorganic_pct' => 20, 'recorded_at' => now()->subHour()]);
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 42, 'inorganic_pct' => 68, 'recorded_at' => now()]);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$unit->id}")
        ->assertOk()
        ->assertJsonPath('latest_fill.organic_pct', 42)
        ->assertJsonPath('latest_fill.inorganic_pct', 68);
});

it('returns raw fill history within range', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 10, 'inorganic_pct' => 5, 'recorded_at' => now()->subHours(2)]);
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 20, 'inorganic_pct' => 15, 'recorded_at' => now()->subDays(3)]);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$unit->id}/fill-history")
        ->assertOk()
        ->assertJsonPath('interval', 'raw')
        ->assertJsonCount(1, 'data'); // default range 24 jam terakhir
});

it('returns hourly bucketed averages', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);
    $base = Carbon::parse('2026-07-10 10:00:00');
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 10, 'inorganic_pct' => 30, 'recorded_at' => $base]);
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 20, 'inorganic_pct' => 50, 'recorded_at' => $base->copy()->addMinutes(30)]);
    FillSnapshot::create(['unit_id' => $unit->id, 'organic_pct' => 60, 'inorganic_pct' => 70, 'recorded_at' => $base->copy()->addHours(2)]);

    $response = $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$unit->id}/fill-history?interval=hourly&from=2026-07-10&to=2026-07-11")
        ->assertOk()
        ->assertJsonPath('interval', 'hourly')
        ->assertJsonCount(2, 'data');

    expect($response->json('data.0.avg_organic_pct'))->toBe(15)
        ->and($response->json('data.0.avg_inorganic_pct'))->toBe(40)
        ->and($response->json('data.1.avg_organic_pct'))->toBe(60);
});

it('rejects raw fill history range longer than 31 days', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$unit->id}/fill-history?from=2026-01-01&to=2026-03-01")
        ->assertUnprocessable()
        ->assertJsonValidationErrors('from');
});

it('returns paginated sort logs with is_correct filter', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);
    SortLog::create(['unit_id' => $unit->id, 'category_detected' => 'organic', 'is_correct' => true, 'created_at' => now()]);
    SortLog::create(['unit_id' => $unit->id, 'category_detected' => 'organic', 'is_correct' => false, 'created_at' => now()->subMinute()]);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$unit->id}/sort-logs")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonStructure(['data', 'links', 'meta']);

    $this->actingAs($this->superAdmin)
        ->getJson("/api/units/{$unit->id}/sort-logs?is_correct=0")
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.is_correct', false);
});
