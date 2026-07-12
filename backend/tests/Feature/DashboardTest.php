<?php

use App\Models\AdminUser;
use App\Models\Alert;
use App\Models\FillSnapshot;
use App\Models\School;
use App\Models\SortLog;
use App\Models\Unit;

it('returns scoped summary for school_admin', function () {
    $schoolA = School::factory()->create();
    $schoolB = School::factory()->create();

    $unitA = Unit::factory()->create(['school_id' => $schoolA->id, 'status' => 'active']);
    $unitA2 = Unit::factory()->create(['school_id' => $schoolA->id, 'status' => 'offline']);
    $unitB = Unit::factory()->create(['school_id' => $schoolB->id, 'status' => 'active']);

    FillSnapshot::create(['unit_id' => $unitA->id, 'organic_pct' => 40, 'inorganic_pct' => 60, 'recorded_at' => now()]);
    FillSnapshot::create(['unit_id' => $unitA2->id, 'organic_pct' => 80, 'inorganic_pct' => 20, 'recorded_at' => now()]);
    FillSnapshot::create(['unit_id' => $unitB->id, 'organic_pct' => 100, 'inorganic_pct' => 100, 'recorded_at' => now()]);

    Alert::create(['unit_id' => $unitA->id, 'alert_type' => 'fill_70', 'message' => 'x']);
    Alert::create(['unit_id' => $unitB->id, 'alert_type' => 'fill_90', 'message' => 'y']);

    SortLog::create(['unit_id' => $unitA->id, 'category_detected' => 'organic', 'is_correct' => true, 'created_at' => now()]);
    SortLog::create(['unit_id' => $unitA->id, 'category_detected' => 'organic', 'is_correct' => true, 'created_at' => now()]);
    SortLog::create(['unit_id' => $unitA->id, 'category_detected' => 'organic', 'is_correct' => false, 'created_at' => now()]);
    SortLog::create(['unit_id' => $unitB->id, 'category_detected' => 'organic', 'is_correct' => false, 'created_at' => now()]);

    $this->actingAs(AdminUser::factory()->create(['school_id' => $schoolA->id]))
        ->getJson('/api/dashboard/summary')
        ->assertOk()
        ->assertJson([
            'total_units' => 2,
            'units_online' => 1,
            'units_offline' => 1,
            'avg_organic_pct' => 60,   // (40+80)/2
            'avg_inorganic_pct' => 40, // (60+20)/2
            'unread_alerts' => 1,
            'sort_accuracy_7d' => 66.7, // 2 dari 3
        ]);
});

it('returns nulls when there is no data yet', function () {
    $school = School::factory()->create();

    $this->actingAs(AdminUser::factory()->create(['school_id' => $school->id]))
        ->getJson('/api/dashboard/summary')
        ->assertOk()
        ->assertJson([
            'total_units' => 0,
            'avg_organic_pct' => null,
            'avg_inorganic_pct' => null,
            'sort_accuracy_7d' => null,
        ]);
});
