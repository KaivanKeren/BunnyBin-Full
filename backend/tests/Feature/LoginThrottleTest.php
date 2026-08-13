<?php

use App\Models\AdminUser;
use App\Models\School;
use App\Models\Unit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Mengunci pertahanan brute force di /auth/login.
 *
 * Sebelum ini tidak ada throttle sama sekali di seluruh API: Laravel 11+ berhenti
 * memasang throttle:api secara otomatis, dan bootstrap/app.php tidak pernah
 * memanggil throttleApi(). Satu-satunya endpoint yang terlindungi adalah
 * /cv/classify. Test di berkas ini ada supaya kondisi itu tidak diam-diam
 * kembali — menghapus throttleApi() atau middleware 'throttle:login' akan
 * langsung memerahkannya.
 */

/** Tiap percobaan dari IP berbeda supaya batas per-IP tidak ikut terpicu. */
function attemptLoginFrom(Tests\TestCase $test, string $ip, string $email): Illuminate\Testing\TestResponse
{
    return $test->withServerVariables(['REMOTE_ADDR' => $ip])
        ->postJson('/api/auth/login', ['email' => $email, 'password' => 'salah-total']);
}

it('throttles repeated login attempts from one IP', function () {
    AdminUser::factory()->create(['email' => 'admin@sekolah.test']);

    // 5 percobaan pertama ditolak sebagai kredensial salah (422), bukan 429.
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/auth/login', [
            'email' => 'admin@sekolah.test',
            'password' => 'salah-total',
        ])->assertUnprocessable();
    }

    $this->postJson('/api/auth/login', [
        'email' => 'admin@sekolah.test',
        'password' => 'salah-total',
    ])->assertStatus(429);
});

it('throttles by IP even when the attacker rotates the target email', function () {
    // Penyerang menyisir banyak akun dari satu tempat: batas per-email tidak
    // akan pernah melihat pola ini karena tiap email hanya dicoba sekali.
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/auth/login', [
            'email' => "korban{$i}@sekolah.test",
            'password' => 'salah-total',
        ])->assertUnprocessable();
    }

    $this->postJson('/api/auth/login', [
        'email' => 'korban6@sekolah.test',
        'password' => 'salah-total',
    ])->assertStatus(429);
});

it('throttles a distributed attack on one email across many IPs', function () {
    AdminUser::factory()->create(['email' => 'target@sekolah.test']);

    // Tiap percobaan dari IP baru, jadi batas per-IP (5/menit) tidak pernah
    // tersentuh. Tanpa batas per-email, botnet bisa menebak tanpa henti.
    foreach (range(1, 20) as $i) {
        attemptLoginFrom($this, "10.0.0.{$i}", 'target@sekolah.test')
            ->assertUnprocessable();
    }

    attemptLoginFrom($this, '10.0.0.99', 'target@sekolah.test')
        ->assertStatus(429);
});

it('counts successful logins too, so bcrypt work stays bounded', function () {
    AdminUser::factory()->create([
        'email' => 'admin@sekolah.test',
        'password' => 'rahasia123',
    ]);

    // Sengaja memakai middleware throttle (menghitung SEMUA request), bukan pola
    // "hitung hanya kegagalan" ala Fortify. Alasannya: setiap request login
    // membayar bcrypt cost 12 terlepas dari hasilnya, jadi hanya menghitung
    // kegagalan tetap membiarkan request valid berulang menghabiskan CPU.
    //
    // Referer wajib: statefulApi() baru memasang session middleware untuk
    // request dari domain stateful, dan login sukses memanggil session()->regenerate().
    $spa = fn () => $this->withHeader('Referer', 'http://localhost:5173');

    foreach (range(1, 5) as $i) {
        $spa()->postJson('/api/auth/login', [
            'email' => 'admin@sekolah.test',
            'password' => 'rahasia123',
        ])->assertOk();
    }

    $spa()->postJson('/api/auth/login', [
        'email' => 'admin@sekolah.test',
        'password' => 'rahasia123',
    ])->assertStatus(429);
});

it('keeps the api baseline looser than the cv-classify limiter for kiosk tokens', function () {
    // Kedua limiter berlaku bersamaan di /cv/classify dan yang paling ketat yang
    // menang. Kalau baseline 'api' turun sampai atau di bawah batas cv-classify,
    // pemindaian kiosk mulai kena 429 DAN limiter cv-classify berubah jadi
    // konfigurasi mati yang tak pernah tercapai.
    //
    // Kedua batas dibaca dari limiter yang sesungguhnya, bukan ditembak sebagai
    // angka tetap: batas cv-classify sudah pernah berubah sekali (600 -> 60 saat
    // kiosk pindah ke CV_MODE=vlm), dan versi lama test ini tetap hijau sambil
    // berhenti menjaga apa pun karena angkanya ditulis langsung di sini.
    $unit = Unit::factory()->for(School::factory())->create();

    $request = Request::create('/api/cv/classify', 'POST');
    $request->setUserResolver(fn () => $unit);

    $baseline = call_user_func(RateLimiter::limiter('api'), $request);
    $cvClassify = call_user_func(RateLimiter::limiter('cv-classify'), $request);

    expect($baseline->maxAttempts)->toBeGreaterThan($cvClassify->maxAttempts);
});

it('applies a baseline throttle to authenticated admin API routes', function () {
    // Bukti bahwa throttleApi() benar-benar terpasang: tanpa limiter 'api'
    // terdaftar, request pertama justru melempar MissingRateLimiterException,
    // jadi 200 di sini sekaligus membuktikan definisinya ada dan terpakai.
    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/quiz-items')
        ->assertOk()
        ->assertHeader('X-RateLimit-Limit');
});
