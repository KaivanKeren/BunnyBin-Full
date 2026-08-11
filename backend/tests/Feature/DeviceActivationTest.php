<?php

use App\Models\School;
use App\Models\Unit;
use App\Models\UnitActivationCode;

/**
 * Provisioning token kiosk saat runtime — pengganti VITE_KIOSK_API_TOKEN.
 *
 * Selama token datang dari variabel VITE_*, ia SELALU ter-inline ke dalam bundle
 * JavaScript yang dilayankan ke browser: terbaca lewat DevTools di tablet kiosk,
 * dan (sebelum task 1.4) berlaku selamanya. Rute ini memindahkan rahasianya ke
 * localStorage perangkat, sehingga tidak pernah ikut ter-build.
 *
 * Karena ini satu-satunya rute yang menerbitkan token TANPA autentikasi
 * sebelumnya, sifat sekali-pakai dan kedaluwarsanya adalah keseluruhan
 * pertahanannya — itulah yang dikunci di sini.
 */
function makeUnit(string $code = 'BNX-001'): Unit
{
    return Unit::factory()->for(School::factory())->create(['code' => $code]);
}

it('exchanges a valid activation code for a kiosk token', function () {
    $unit = makeUnit();
    $code = UnitActivationCode::issueFor($unit);

    $response = $this->postJson('/api/devices/activate', ['code' => $code])
        ->assertCreated()
        ->assertJson(['unit_code' => 'BNX-001', 'unit_id' => $unit->id]);

    $token = $response->json('token');
    expect($token)->toBeString()->not->toBeEmpty();

    // Token hasil tukar harus benar-benar bisa dipakai untuk ingest.
    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/units/BNX-001/heartbeat')
        ->assertOk();
});

it('refuses to reuse a code that has already been exchanged', function () {
    $code = UnitActivationCode::issueFor(makeUnit());

    $this->postJson('/api/devices/activate', ['code' => $code])->assertCreated();

    $this->postJson('/api/devices/activate', ['code' => $code])
        ->assertStatus(422)
        ->assertJson(['error' => 'activation_failed']);
});

it('refuses an expired code', function () {
    $unit = makeUnit();
    $code = UnitActivationCode::issueFor($unit, ttlHours: 1);

    $this->travel(2)->hours();

    $this->postJson('/api/devices/activate', ['code' => $code])->assertStatus(422);
});

it('refuses a code that was never issued', function () {
    $this->postJson('/api/devices/activate', ['code' => 'AAAA-AAAA-AAAA'])->assertStatus(422);
});

it('accepts the code regardless of dashes, spacing, and letter case', function () {
    // Kode ini diketik manusia dari layar ke tablet. Menolaknya hanya karena
    // tanda hubung atau huruf kecil adalah kegagalan yang tak ada gunanya.
    $code = UnitActivationCode::issueFor(makeUnit());
    $messy = strtolower(str_replace('-', ' ', $code));

    $this->postJson('/api/devices/activate', ['code' => $messy])->assertCreated();
});

it('never stores the activation code in plaintext', function () {
    $code = UnitActivationCode::issueFor(makeUnit());

    $stored = UnitActivationCode::sole();
    $bare = UnitActivationCode::normalize($code);

    expect($stored->code_hash)->not->toBe($code)
        ->and($stored->code_hash)->not->toBe($bare)
        ->and($stored->code_hash)->toBe(hash('sha256', $bare));
});

it('revokes the previous kiosk token when a device is re-activated', function () {
    // Tablet yang hilang tidak boleh tetap bisa menulis data setelah unit yang
    // sama dipasang ulang di perangkat baru.
    $unit = makeUnit();

    $first = $this->postJson('/api/devices/activate', [
        'code' => UnitActivationCode::issueFor($unit),
    ])->json('token');

    $second = $this->postJson('/api/devices/activate', [
        'code' => UnitActivationCode::issueFor($unit),
    ])->json('token');

    $this->withHeader('Authorization', "Bearer {$first}")
        ->postJson('/api/units/BNX-001/heartbeat')
        ->assertUnauthorized();

    $this->withHeader('Authorization', "Bearer {$second}")
        ->postJson('/api/units/BNX-001/heartbeat')
        ->assertOk();
});

it('invalidates any older unused code when a new one is issued', function () {
    // Hanya boleh ada satu kode hidup per unit: kode yang tercecer di catatan
    // lama tidak boleh diam-diam tetap berlaku.
    $unit = makeUnit();
    $lama = UnitActivationCode::issueFor($unit);
    $baru = UnitActivationCode::issueFor($unit);

    $this->postJson('/api/devices/activate', ['code' => $lama])->assertStatus(422);
    $this->postJson('/api/devices/activate', ['code' => $baru])->assertCreated();
});

it('issues a token scoped to the kiosk ability only', function () {
    $unit = makeUnit();

    $token = $this->postJson('/api/devices/activate', [
        'code' => UnitActivationCode::issueFor($unit),
    ])->json('token');

    // Token kiosk tetap tidak boleh menyentuh rute admin (batas dari task 1.6).
    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/units')
        ->assertForbidden();
});

it('does not let one unit token activate into another unit', function () {
    $satu = makeUnit('BNX-001');
    makeUnit('BNX-002');

    $token = $this->postJson('/api/devices/activate', [
        'code' => UnitActivationCode::issueFor($satu),
    ])->json('token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/units/BNX-002/heartbeat')
        ->assertForbidden();
});

it('throttles brute-force attempts against the activation endpoint', function () {
    // Kodenya 55 bit, jadi menebak tidak realistis — tapi rute ini menerbitkan
    // token TANPA autentikasi sebelumnya, jadi batas laju adalah lapis terakhir
    // yang tersisa bila panjang kode suatu saat diperpendek.
    foreach (range(1, 10) as $i) {
        $this->postJson('/api/devices/activate', ['code' => 'AAAA-AAAA-AAAA'])
            ->assertStatus(422);
    }

    $this->postJson('/api/devices/activate', ['code' => 'AAAA-AAAA-AAAA'])
        ->assertStatus(429);
});

it('issues tokens that eventually expire', function () {
    // Token kiosk dulu berlaku selamanya, jadi satu kali bocor = akses permanen.
    // Batas waktu ini baru masuk akal setelah provisioning runtime ada:
    // perangkat bisa mengambil token barunya sendiri lewat kode aktivasi.
    //
    config(['sanctum.expiration' => 60]);

    $unit = makeUnit();
    $token = $this->postJson('/api/devices/activate', [
        'code' => UnitActivationCode::issueFor($unit),
    ])->json('token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/units/BNX-001/heartbeat')
        ->assertOk();

    $this->travel(61)->minutes();

    // forgetGuards() WAJIB di sini, dan ini artefak test — bukan perilaku
    // produksi. RequestGuard menyimpan user yang sudah ter-resolve, dan
    // AuthManager mem-cache instance guard sepanjang satu test. Tanpa ini,
    // request kedua memakai ulang hasil autentikasi request PERTAMA dan tidak
    // pernah memeriksa token lagi — test akan lulus (200) dan seolah
    // membuktikan token tak kedaluwarsa, padahal ia tak menguji apa pun.
    // Di produksi tiap request punya container dan guard baru, jadi
    // pemeriksaannya memang berjalan setiap kali.
    $this->app['auth']->forgetGuards();

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/units/BNX-001/heartbeat')
        ->assertUnauthorized();
});

it('keeps admin sessions unaffected by token expiration', function () {
    // sanctum.expiration hanya mengatur TOKEN. Sesi cookie dashboard admin
    // dikendalikan SESSION_LIFETIME — menyamakan keduanya akan membuat admin
    // ter-logout mengikuti jadwal perangkat, yang tidak ada hubungannya.
    config(['sanctum.expiration' => 1]);

    $this->travel(2)->minutes();

    $this->actingAs(App\Models\AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/auth/me')
        ->assertOk();
});
