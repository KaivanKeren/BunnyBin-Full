<?php

use App\Models\AdminUser;
use App\Models\School;
use App\Models\Unit;

/**
 * Mengunci batas antara DUA jenis principal yang sama-sama lolos auth:sanctum:
 * AdminUser (sesi dashboard) dan Unit (token kiosk).
 *
 * Sebelum middleware 'admin' ada, token kiosk menembus sampai ke controller dan
 * berhenti di TypeError — /units, /dashboard/summary, /alerts, dan /sort-logs
 * membalas 500, sementara /auth/me justru membalas 200 berisi profil untuk
 * sebuah Unit. Artinya yang menahan kebocoran data lintas sekolah hanyalah type
 * hint scopeForUser(Builder, AdminUser); endpoint baru yang kebetulan tidak
 * memakainya akan membocorkan data, bukan crash.
 */
function kioskToken(): string
{
    $unit = Unit::factory()->for(School::factory())->create(['code' => 'BNX-999']);

    return $unit->createToken('kiosk', ['kiosk'])->plainTextToken;
}

it('forbids kiosk unit tokens on every admin route', function (string $method, string $uri) {
    $this->withHeader('Authorization', 'Bearer '.kioskToken())
        ->json($method, $uri)
        ->assertForbidden();
})->with([
    'daftar unit' => ['GET', '/api/units'],
    'ringkasan dashboard' => ['GET', '/api/dashboard/summary'],
    'daftar alert' => ['GET', '/api/alerts'],
    'log sortir lintas unit' => ['GET', '/api/sort-logs'],
    'profil admin' => ['GET', '/api/auth/me'],
    'logout admin' => ['POST', '/api/auth/logout'],
    'detail unit' => ['GET', '/api/units/1'],
    'riwayat fill' => ['GET', '/api/units/1/fill-history'],
    'sort log per unit' => ['GET', '/api/units/1/sort-logs'],
    'tandai alert dibaca' => ['PATCH', '/api/alerts/1/read'],
    'daftar sekolah' => ['GET', '/api/schools'],
    'buat unit' => ['POST', '/api/units'],
    'buat quiz item' => ['POST', '/api/quiz-items'],
]);

it('still lets a kiosk unit token read the quiz bank', function () {
    // Satu-satunya pengecualian yang disengaja: kiosk memuat seluruh bank kuis
    // aktif saat boot. Kalau test ini merah, kiosk kehilangan pertanyaannya dan
    // diam-diam jatuh ke fallbackBank lokal yang bisa berbeda dari bank server.
    $this->withHeader('Authorization', 'Bearer '.kioskToken())
        ->getJson('/api/quiz-items')
        ->assertOk()
        ->assertJsonStructure(['data']);
});

it('keeps kiosk ingest routes working for unit tokens', function () {
    // Bukti bahwa middleware 'admin' tidak salah pasang ke jalur device:
    // rute ingest harus tetap milik Unit, bukan AdminUser.
    $unit = Unit::factory()->for(School::factory())->create(['code' => 'BNX-777']);
    $token = $unit->createToken('kiosk', ['kiosk'])->plainTextToken;

    $this->withHeader('Authorization', 'Bearer '.$token)
        ->postJson('/api/units/BNX-777/heartbeat')
        ->assertOk();
});

it('still serves admins on the routes kiosk tokens are barred from', function () {
    // Sisi lain dari batas yang sama: menutup kiosk tidak boleh ikut menutup
    // admin. Tanpa test ini, memasang 'admin' terlalu lebar (mis. sampai ke
    // rute ingest) baru ketahuan saat dashboard mati.
    $admin = AdminUser::factory()->superAdmin()->create();

    $this->actingAs($admin)->getJson('/api/units')->assertOk();
    $this->actingAs($admin)->getJson('/api/dashboard/summary')->assertOk();
    $this->actingAs($admin)->getJson('/api/alerts')->assertOk();
    $this->actingAs($admin)->getJson('/api/sort-logs')->assertOk();
    $this->actingAs($admin)->getJson('/api/auth/me')->assertOk();
    $this->actingAs($admin)->getJson('/api/schools')->assertOk();
});

it('rejects unauthenticated callers with 401, not 403', function () {
    // Membedakan "belum login" dari "login tapi jenis principal salah" —
    // frontend admin memakai 401 untuk memicu redirect ke /login (client.ts),
    // jadi mengubahnya jadi 403 akan membuat sesi kedaluwarsa menggantung.
    $this->getJson('/api/units')->assertUnauthorized();
    $this->getJson('/api/quiz-items')->assertUnauthorized();
});
