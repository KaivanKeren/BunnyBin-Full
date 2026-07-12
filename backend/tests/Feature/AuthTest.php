<?php

use App\Models\AdminUser;

// Simulasikan request SPA (Sanctum stateful) — tanpa Referer/Origin dari domain
// stateful, statefulApi() tidak memasang session middleware di route /api.
function asSpa(Tests\TestCase $test): Tests\TestCase
{
    return $test->withHeader('Referer', 'http://localhost:5173');
}

it('logs in with valid credentials and returns the profile', function () {
    $user = AdminUser::factory()->create([
        'email' => 'admin@sekolah.test',
        'password' => 'rahasia123',
    ]);

    $response = asSpa($this)->postJson('/api/auth/login', [
        'email' => 'admin@sekolah.test',
        'password' => 'rahasia123',
    ]);

    $response->assertOk()
        ->assertJson([
            'id' => $user->id,
            'email' => 'admin@sekolah.test',
            'role' => AdminUser::ROLE_SCHOOL_ADMIN,
        ])
        ->assertJsonPath('school.id', $user->school_id);

    $this->assertAuthenticatedAs($user);
});

it('rejects invalid credentials with a validation error', function () {
    AdminUser::factory()->create(['email' => 'admin@sekolah.test']);

    $response = $this->postJson('/api/auth/login', [
        'email' => 'admin@sekolah.test',
        'password' => 'salah-total',
    ]);

    $response->assertUnprocessable()->assertJsonValidationErrors('email');
    $this->assertGuest();
});

it('returns the super admin profile with null school on /auth/me', function () {
    $user = AdminUser::factory()->superAdmin()->create();

    $this->actingAs($user)
        ->getJson('/api/auth/me')
        ->assertOk()
        ->assertJson([
            'id' => $user->id,
            'role' => AdminUser::ROLE_SUPER_ADMIN,
            'school' => null,
        ]);
});

it('rejects unauthenticated /auth/me with 401', function () {
    $this->getJson('/api/auth/me')->assertUnauthorized();
});

it('logs out and invalidates the session', function () {
    $user = AdminUser::factory()->create();

    asSpa($this)->actingAs($user)->postJson('/api/auth/logout')->assertOk();

    $this->assertGuest('web');
});

it('blocks school_admin from super_admin-only routes via role middleware', function () {
    \Illuminate\Support\Facades\Route::middleware(['auth:sanctum', 'role:super_admin'])
        ->get('/api/_test/super-only', fn () => response()->json(['ok' => true]));

    $this->actingAs(AdminUser::factory()->create())
        ->getJson('/api/_test/super-only')
        ->assertForbidden();

    $this->actingAs(AdminUser::factory()->superAdmin()->create())
        ->getJson('/api/_test/super-only')
        ->assertOk();
});
