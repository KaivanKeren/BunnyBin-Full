<?php

use App\Models\AdminUser;
use App\Models\QuizItem;
use App\Models\School;
use App\Models\Unit;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

beforeEach(function () {
    $this->unit = Unit::factory()->create([
        'school_id' => School::factory()->create()->id,
        'code' => 'BNB-001',
    ]);
});

function actAsKiosk(Unit $unit): void
{
    Sanctum::actingAs($unit, ['kiosk']);
}

function fakeCvSuccess(string $category = 'organic', float $confidence = 0.85): void
{
    Http::fake(['*/classify' => Http::response([
        'category' => $category,
        'confidence' => $confidence,
        'bbox' => null,
        'model_version' => 'dummy-1',
    ])]);
}

it('proxies classification result from the CV service', function () {
    fakeCvSuccess();
    actAsKiosk($this->unit);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertOk()
        ->assertJson([
            'category' => 'organic',
            'confidence' => 0.85,
            'model_version' => 'dummy-1',
        ]);

    Http::assertSent(fn ($request) => str_ends_with($request->url(), '/classify')
        && $request['image_base64'] === base64_encode('img'));
});

it('stores a sort log when unit_code and quiz_item_id are provided', function () {
    fakeCvSuccess('inorganic');
    actAsKiosk($this->unit);
    $quizItem = QuizItem::factory()->create(['category' => 'organic']);

    $this->postJson('/api/cv/classify', [
        'image_base64' => base64_encode('img'),
        'unit_code' => 'BNB-001',
        'quiz_item_id' => $quizItem->id,
    ])->assertOk();

    $this->assertDatabaseHas('sort_logs', [
        'unit_id' => $this->unit->id,
        'quiz_item_id' => $quizItem->id,
        'category_detected' => 'inorganic',
        'is_correct' => false,
    ]);
});

it('does not store a sort log without quiz context', function () {
    fakeCvSuccess();
    actAsKiosk($this->unit);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertOk();

    $this->assertDatabaseCount('sort_logs', 0);
});

it('returns 503 cv_unavailable when the CV service is down', function () {
    Http::fake(['*/classify' => Http::response('boom', 500)]);
    actAsKiosk($this->unit);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertStatus(503)
        ->assertJson(['error' => 'cv_unavailable']);
});

it('rejects requests without kiosk token', function () {
    Http::fake();

    // Tanpa auth sama sekali
    $this->postJson('/api/cv/classify', ['image_base64' => 'x'])
        ->assertUnauthorized();

    // Admin (bukan token unit) — harus ditolak
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->postJson('/api/cv/classify', ['image_base64' => 'x'])
        ->assertForbidden();

    Http::assertNothingSent();
});

it('requires an image payload', function () {
    Http::fake();
    actAsKiosk($this->unit);

    $this->postJson('/api/cv/classify', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['image', 'image_base64']);
});
