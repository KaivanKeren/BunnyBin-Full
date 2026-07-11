<?php

use App\Models\AdminUser;
use App\Models\QuizItem;

it('all roles can list quiz items', function () {
    QuizItem::factory()->count(3)->create();

    $this->actingAs(AdminUser::factory()->create())
        ->getJson('/api/quiz-items')
        ->assertOk()
        ->assertJsonCount(3, 'data');

    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/quiz-items')
        ->assertOk();
});

it('school_admin is forbidden from quiz item mutations', function () {
    $admin = AdminUser::factory()->create();
    $item = QuizItem::factory()->create();

    $this->actingAs($admin)
        ->postJson('/api/quiz-items', ['category' => 'organic', 'item_name' => 'Kulit pisang'])
        ->assertForbidden();

    $this->actingAs($admin)
        ->putJson("/api/quiz-items/{$item->id}", ['item_name' => 'Diubah'])
        ->assertForbidden();

    $this->actingAs($admin)
        ->deleteJson("/api/quiz-items/{$item->id}")
        ->assertForbidden();
});

it('super_admin can create, update, and delete quiz items', function () {
    $superAdmin = AdminUser::factory()->superAdmin()->create();

    $created = $this->actingAs($superAdmin)
        ->postJson('/api/quiz-items', [
            'category' => 'inorganic',
            'item_name' => 'Botol plastik',
            'explanation' => 'Plastik sulit terurai.',
        ])
        ->assertCreated()
        ->assertJsonPath('item_name', 'Botol plastik');

    $id = $created->json('id');

    $this->actingAs($superAdmin)
        ->putJson("/api/quiz-items/{$id}", ['active' => false])
        ->assertOk()
        ->assertJsonPath('active', false);

    $this->actingAs($superAdmin)
        ->deleteJson("/api/quiz-items/{$id}")
        ->assertNoContent();

    $this->assertDatabaseMissing('quiz_items', ['id' => $id]);
});

it('rejects invalid quiz item category', function () {
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->postJson('/api/quiz-items', ['category' => 'logam', 'item_name' => 'Paku'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('category');
});
