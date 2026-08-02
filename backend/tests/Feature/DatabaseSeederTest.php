<?php

use App\Models\Alert;
use App\Models\FillSnapshot;
use App\Models\MaintenanceEvent;
use App\Models\QuizItem;
use App\Models\SortLog;
use App\Models\Unit;
use Database\Seeders\DatabaseSeeder;

it('seeds exactly one prototype unit matching the single hardware device', function () {
    $this->seed(DatabaseSeeder::class);

    // Prototype hanya punya satu hardware. Menambah unit dummy kedua membuat
    // dashboard admin menampilkan tong yang tidak ada wujudnya, dan kiosk bisa
    // tanpa sengaja diarahkan ke unit yang salah.
    expect(Unit::count())->toBe(1);

    $unit = Unit::sole();
    expect($unit->code)->toBe(DatabaseSeeder::UNIT_CODE)
        // Terdaftar, tapi belum pernah melapor — status active baru sah setelah
        // ESP32 benar-benar mengirim sesuatu.
        ->and($unit->status)->toBe(Unit::STATUS_OFFLINE)
        ->and($unit->last_seen_at)->toBeNull();
});

it('seeds the unit geometry that matches the firmware constants', function () {
    $this->seed(DatabaseSeeder::class);

    // BunnyBin_ESP32.ino menghitung persen dengan BIN_HEIGHT_CM 55 dan sensor
    // di tutup (offset 0). Geometri unit yang berbeda membuat satu jarak sensor
    // menghasilkan dua persen berbeda: satu di layar kiosk, satu di dashboard.
    $unit = Unit::sole();
    expect($unit->bin_height_cm)->toBe(55)
        ->and($unit->sensor_offset_cm)->toBe(0)
        ->and($unit->fillPctFromDistance(27.5))->toBe(50);
});

it('seeds the teaching content the kiosk needs before any child uses it', function () {
    $this->seed(DatabaseSeeder::class);

    expect(QuizItem::where('active', true)->count())->toBeGreaterThan(0)
        ->and(QuizItem::where('category', QuizItem::CATEGORY_ORGANIC)->count())->toBeGreaterThan(0)
        ->and(QuizItem::where('category', QuizItem::CATEGORY_INORGANIC)->count())->toBeGreaterThan(0);
});

it('seeds no device data at all — every row must come from real hardware', function () {
    $this->seed(DatabaseSeeder::class);

    // Ini inti dari seeder yang dirampingkan: dashboard yang kosong di awal
    // adalah harga untuk memastikan setiap angka yang muncul memang dibaca
    // sensor. Satu baris karangan saja membuat hasil uji integrasi tidak bisa
    // dipercaya, karena tidak ada cara membedakannya dari data sungguhan.
    expect(FillSnapshot::count())->toBe(0)
        ->and(SortLog::count())->toBe(0)
        ->and(Alert::count())->toBe(0)
        ->and(MaintenanceEvent::count())->toBe(0);
});
