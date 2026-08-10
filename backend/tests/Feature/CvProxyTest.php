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
        'code' => 'BNX-001',
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

it('NEVER stores a sort log, even with quiz context attached', function () {
    // Endpoint ini dulu menulis sort_logs bila unit_code + quiz_item_id ikut
    // dikirim. Blok itu dihapus dengan sengaja, dan test ini yang menjaganya
    // tetap terhapus — karena mengembalikannya terlihat seperti "menambah
    // fitur", padahal konsekuensinya berat:
    //
    //   - /cv/classify dipanggil 5 KALI PER DETIK selama pemindaian, jadi
    //     klien yang mengirim kedua parameter itu menulis lima baris per detik
    //     ke hypertable, diam-diam.
    //   - is_correct-nya membandingkan hasil CV dengan kategori quiz item,
    //     yaitu "apakah CV setuju dengan soalnya" — diukur sebelum anak
    //     menjawab apa pun. Penilaian yang benar (jawaban anak vs deteksi)
    //     dicatat lewat /units/{code}/sort-logs.
    fakeCvSuccess('inorganic');
    actAsKiosk($this->unit);
    $quizItem = QuizItem::factory()->create(['category' => 'organic']);

    $this->postJson('/api/cv/classify', [
        'image_base64' => base64_encode('img'),
        'unit_code' => 'BNX-001',
        'quiz_item_id' => $quizItem->id,
    ])->assertOk();

    $this->assertDatabaseCount('sort_logs', 0);
});

it('does not store a sort log without quiz context', function () {
    fakeCvSuccess();
    actAsKiosk($this->unit);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertOk();

    $this->assertDatabaseCount('sort_logs', 0);
});

it('still rejects a unit_code that does not belong to the caller token', function () {
    // unit_code tidak lagi dipakai untuk menulis, tapi validasi kepemilikannya
    // dipertahankan: klien lama yang masih mengirimnya tidak boleh lolos
    // memakai kode unit orang lain.
    fakeCvSuccess();
    actAsKiosk($this->unit);
    Unit::factory()->for(School::factory())->create(['code' => 'BNX-002']);

    $this->postJson('/api/cv/classify', [
        'image_base64' => base64_encode('img'),
        'unit_code' => 'BNX-002',
    ])->assertForbidden();
});

it('keeps sort-log writing in one place — the ingest endpoint', function () {
    // Sisi lain dari keputusan yang sama: menghapus jalur di /cv/classify tidak
    // boleh ikut mematikan satu-satunya jalur yang sah.
    actAsKiosk($this->unit);

    $quizItem = QuizItem::factory()->create(['category' => 'organic']);

    $this->postJson("/api/units/{$this->unit->code}/sort-logs", [
        'quiz_item_id' => $quizItem->id,
        'category_detected' => 'organic',
        'is_correct' => true,
    ])->assertCreated();

    $this->assertDatabaseCount('sort_logs', 1);
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
