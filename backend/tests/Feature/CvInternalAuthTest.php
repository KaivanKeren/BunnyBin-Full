<?php

use App\Models\School;
use App\Models\Unit;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;

/**
 * Kontrak antara Laravel dan CV service setelah layanan itu berautentikasi.
 *
 * Dua hal yang dikunci di sini ditemukan justru saat memasang autentikasinya,
 * dan keduanya soal MENERJEMAHKAN kegagalan CV service ke jawaban yang benar
 * untuk kiosk — bukan sekadar meneruskan apa adanya.
 */
beforeEach(function () {
    $this->unit = Unit::factory()->create([
        'school_id' => School::factory()->create()->id,
        'code' => 'BNX-001',
    ]);

    Sanctum::actingAs($this->unit, ['kiosk']);
});

it('sends the internal token header to the CV service', function () {
    config(['services.cv.internal_token' => 'rahasia-internal']);

    Http::fake(['*/classify' => Http::response([
        'category' => 'organic', 'confidence' => 0.9, 'bbox' => null, 'model_version' => 'dummy-1',
    ])]);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])->assertOk();

    Http::assertSent(fn ($request) => $request->hasHeader('X-Internal-Token', 'rahasia-internal'));
});

it('reports a rejected internal token as service unavailable, not as a client error', function () {
    // 401 dari CV service = shared secret KITA salah, bukan kesalahan kiosk.
    // Meneruskannya apa adanya menyalahkan kiosk atas salah konfigurasi server,
    // dan karena 401 masuk RETRYABLE_STATUSES di kiosk (api/errors.ts), kegagalan
    // konfigurasi permanen akan terbaca sebagai gangguan sementara.
    Http::fake(['*/classify' => Http::response(['detail' => 'X-Internal-Token tidak valid'], 401)]);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertStatus(503)
        ->assertJson(['error' => 'cv_unavailable']);
});

it('reports a forbidden internal token as service unavailable too', function () {
    Http::fake(['*/classify' => Http::response(['detail' => 'terlarang'], 403)]);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertStatus(503);
});

it('survives a pydantic validation error whose detail is an array', function () {
    // FastAPI memakai DUA bentuk untuk `detail`: string untuk HTTPException kita
    // sendiri, tapi ARRAY untuk error validasi pydantic. abort() hanya menerima
    // string, jadi bentuk array sebelumnya menghasilkan TypeError — setiap error
    // validasi CV service berubah jadi HTTP 500 yang tidak menjelaskan apa pun.
    Http::fake(['*/classify' => Http::response([
        'detail' => [[
            'type' => 'string_too_short',
            'loc' => ['body', 'image_base64'],
            'msg' => 'String should have at least 1 character',
        ]],
    ], 422)]);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertStatus(422)
        ->assertJsonPath('message', 'String should have at least 1 character');
});

it('still forwards a plain string detail unchanged', function () {
    Http::fake(['*/classify' => Http::response(['detail' => 'image_base64 bukan base64 valid'], 422)]);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertStatus(422)
        ->assertJsonPath('message', 'image_base64 bukan base64 valid');
});

it('falls back to a generic message when detail has no usable text', function () {
    Http::fake(['*/classify' => Http::response(['detail' => []], 400)]);

    $this->postJson('/api/cv/classify', ['image_base64' => base64_encode('img')])
        ->assertStatus(400)
        ->assertJsonPath('message', 'Gambar tidak valid.');
});
