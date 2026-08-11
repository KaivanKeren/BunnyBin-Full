<?php

use App\Models\AdminUser;
use App\Models\School;
use App\Models\Unit;

/**
 * Ringkasan dashboard di-cache 30 detik. Tanpa pembatalan, unit yang baru
 * dibuat atau dihapus baru muncul setelah cache kedaluwarsa — dan karena
 * frontend juga polling tiap 30 detik, jendela terburuknya 60 detik. Cukup lama
 * untuk membuat admin mengira penyimpanannya gagal lalu menekan tombolnya lagi.
 */
beforeEach(function () {
    $this->superAdmin = AdminUser::factory()->superAdmin()->create();
    $this->school = School::factory()->create();
});

function ringkasan(Tests\TestCase $test, AdminUser $admin): array
{
    return $test->actingAs($admin)->getJson('/api/dashboard/summary')->json();
}

it('shows a newly created unit immediately, not after the cache expires', function () {
    expect(ringkasan($this, $this->superAdmin)['total_units'])->toBe(0);

    $this->actingAs($this->superAdmin)->postJson('/api/units', [
        'school_id' => $this->school->id,
        'code' => 'BNX-BARU',
    ])->assertCreated();

    expect(ringkasan($this, $this->superAdmin)['total_units'])->toBe(1);
});

it('reflects a deleted unit immediately', function () {
    $unit = Unit::factory()->create(['school_id' => $this->school->id]);
    expect(ringkasan($this, $this->superAdmin)['total_units'])->toBe(1);

    $this->actingAs($this->superAdmin)->deleteJson("/api/units/{$unit->id}")->assertNoContent();

    expect(ringkasan($this, $this->superAdmin)['total_units'])->toBe(0);
});

it('invalidates the school admin view too, not only the super admin one', function () {
    // Ringkasan di-cache PER PERAN. Membatalkan hanya kunci super admin membuat
    // admin sekolah — yang justru paling sering membuka dashboard — tetap
    // melihat angka lama.
    $schoolAdmin = AdminUser::factory()->create(['school_id' => $this->school->id]);

    expect(ringkasan($this, $schoolAdmin)['total_units'])->toBe(0);

    $this->actingAs($this->superAdmin)->postJson('/api/units', [
        'school_id' => $this->school->id,
        'code' => 'BNX-BARU',
    ])->assertCreated();

    expect(ringkasan($this, $schoolAdmin)['total_units'])->toBe(1);
});

it('invalidates both schools when a unit moves between them', function () {
    $sekolahLain = School::factory()->create();
    $adminLama = AdminUser::factory()->create(['school_id' => $this->school->id]);
    $adminBaru = AdminUser::factory()->create(['school_id' => $sekolahLain->id]);

    $unit = Unit::factory()->create(['school_id' => $this->school->id]);
    expect(ringkasan($this, $adminLama)['total_units'])->toBe(1);
    expect(ringkasan($this, $adminBaru)['total_units'])->toBe(0);

    $this->actingAs($this->superAdmin)
        ->putJson("/api/units/{$unit->id}", ['school_id' => $sekolahLain->id])
        ->assertOk();

    expect(ringkasan($this, $adminLama)['total_units'])->toBe(0);
    expect(ringkasan($this, $adminBaru)['total_units'])->toBe(1);
});
