<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sort_logs', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->foreignId('unit_id')->constrained()->cascadeOnDelete();
            $table->foreignId('quiz_item_id')->nullable()->constrained('quiz_items')->nullOnDelete();
            $table->string('category_detected', 20)->nullable(); // hasil CV
            $table->float('confidence')->nullable();
            $table->boolean('is_correct')->nullable();
            $table->timestampTz('created_at')->useCurrent();

            $table->index(['unit_id', 'created_at']);
        });

        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        // Hypertable mensyaratkan kolom partisi ada di PK → PK composite (id, created_at)
        DB::statement('ALTER TABLE sort_logs DROP CONSTRAINT sort_logs_pkey');
        DB::statement('ALTER TABLE sort_logs ADD PRIMARY KEY (id, created_at)');

        if ($this->timescaleAvailable()) {
            DB::statement("SELECT create_hypertable('sort_logs', 'created_at')");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sort_logs');
    }

    private function timescaleAvailable(): bool
    {
        return DB::selectOne("SELECT 1 AS ok FROM pg_extension WHERE extname = 'timescaledb'") !== null;
    }
};
