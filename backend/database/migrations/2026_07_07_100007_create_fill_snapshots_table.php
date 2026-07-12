<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fill_snapshots', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
            $table->smallInteger('organic_pct');
            $table->smallInteger('inorganic_pct');
            $table->timestampTz('recorded_at')->useCurrent();

            // query "fill terbaru per unit" dan chart range
            $table->index(['unit_id', 'recorded_at']);
        });

        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Hypertable mensyaratkan kolom partisi ada di PK → PK composite (id, recorded_at)
        DB::statement('ALTER TABLE fill_snapshots DROP CONSTRAINT fill_snapshots_pkey');
        DB::statement('ALTER TABLE fill_snapshots ADD PRIMARY KEY (id, recorded_at)');

        if ($this->timescaleAvailable()) {
            DB::statement("SELECT create_hypertable('fill_snapshots', 'recorded_at')");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('fill_snapshots');
    }

    private function timescaleAvailable(): bool
    {
        return DB::selectOne("SELECT 1 AS ok FROM pg_extension WHERE extname = 'timescaledb'") !== null;
    }
};
