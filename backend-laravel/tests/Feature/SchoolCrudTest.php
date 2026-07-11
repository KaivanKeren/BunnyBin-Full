<?php

use App\Models\AdminUser;
use App\Models\School;

it('school_admin is forbidden from all school endpoints', function () {
    $admin = AdminUser::factory()->create();
    $school = School::factory()->create();

    $this->actingAs($admin)->getJson('/api/schools')->assertForbidden();
    $this->actingAs($admin)->postJson('/api/schools', ['name' => 'SDN Baru'])->assertForbidden();
    $this->actingAs($admin)->getJson("/api/schools/{$school->id}")->assertForbidden();
    $this->actingAs($admin)->putJson("/api/schools/{$school->id}", ['name' => 'X'])->assertForbidden();
    $this->actingAs($admin)->deleteJson("/api/schools/{$school->id}")->assertForbidden();
});

it('super_admin can manage schools end to end', function () {
    $superAdmin = AdminUser::factory()->superAdmin()->create();

    $created = $this->actingAs($superAdmin)
        ->postJson('/api/schools', [
            'name' => 'SDN 3 Jepara',
            'city' => 'Jepara',
            'province' => 'Jawa Tengah',
        ])
        ->assertCreated()
        ->assertJsonPath('name', 'SDN 3 Jepara');

    $id = $created->json('id');

    $this->actingAs($superAdmin)
        ->getJson('/api/schools')
        ->assertOk()
        ->assertJsonPath('data.0.name', 'SDN 3 Jepara');

    $this->actingAs($superAdmin)
        ->putJson("/api/schools/{$id}", ['name' => 'SDN 3 Jepara Kota'])
        ->assertOk()
        ->assertJsonPath('name', 'SDN 3 Jepara Kota');

    $this->actingAs($superAdmin)
        ->deleteJson("/api/schools/{$id}")
        ->assertNoContent();

    $this->assertDatabaseMissing('schools', ['id' => $id]);
});

it('rejects school creation without a name', function () {
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->postJson('/api/schools', ['city' => 'Kudus'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('name');
});
