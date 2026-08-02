<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('units', function (Blueprint $table) {
            // Geometri tong untuk konversi jarak ultrasonik → persen terisi.
            // Kedua kompartemen memakai tong berukuran sama, jadi cukup satu set.
            $table->unsignedSmallInteger('bin_height_cm')->default(60)->after('installed_at');
            $table->unsignedSmallInteger('sensor_offset_cm')->default(5)->after('bin_height_cm');
        });
    }

    public function down(): void
    {
        Schema::table('units', function (Blueprint $table) {
            $table->dropColumn(['bin_height_cm', 'sensor_offset_cm']);
        });
    }
};
