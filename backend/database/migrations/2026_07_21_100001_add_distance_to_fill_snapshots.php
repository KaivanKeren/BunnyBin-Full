<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Simpan jarak mentah di samping persen: persen dipakai chart & alert,
        // jarak dipakai kalibrasi dan diagnosa sensor. Nullable — baris lama dan
        // device yang masih mengirim persen langsung tidak punya nilai ini.
        Schema::table('fill_snapshots', function (Blueprint $table) {
            $table->decimal('organic_distance_cm', 5, 1)->nullable()->after('inorganic_pct');
            $table->decimal('inorganic_distance_cm', 5, 1)->nullable()->after('organic_distance_cm');
        });
    }

    public function down(): void
    {
        Schema::table('fill_snapshots', function (Blueprint $table) {
            $table->dropColumn(['organic_distance_cm', 'inorganic_distance_cm']);
        });
    }
};
