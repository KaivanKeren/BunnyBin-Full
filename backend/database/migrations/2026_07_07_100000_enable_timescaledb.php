<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        try {
            DB::statement('CREATE EXTENSION IF NOT EXISTS timescaledb');
        } catch (\Throwable $e) {
            logger()->warning('TimescaleDB extension unavailable, continuing without it');
        }
    }

    public function down(): void
    {
        // Extension dibiarkan terpasang; drop extension akan menghapus hypertable.
    }
};
