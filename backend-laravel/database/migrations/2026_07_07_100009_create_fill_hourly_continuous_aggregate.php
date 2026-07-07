<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Continuous aggregate + retention policy (PRD-Database.md §5).
// CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous) tidak boleh
// berjalan dalam transaksi.
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql' || ! $this->timescaleAvailable()) {
            return;
        }

        DB::statement(<<<'SQL'
            CREATE MATERIALIZED VIEW fill_hourly
            WITH (timescaledb.continuous) AS
            SELECT unit_id,
                   time_bucket('1 hour', recorded_at) AS bucket,
                   avg(organic_pct)::smallint   AS avg_organic,
                   avg(inorganic_pct)::smallint AS avg_inorganic,
                   max(organic_pct)  AS max_organic,
                   max(inorganic_pct) AS max_inorganic
            FROM fill_snapshots
            GROUP BY unit_id, bucket
            WITH NO DATA
        SQL);

        DB::statement(<<<'SQL'
            SELECT add_continuous_aggregate_policy('fill_hourly',
              start_offset => INTERVAL '3 hours',
              end_offset   => INTERVAL '30 minutes',
              schedule_interval => INTERVAL '30 minutes')
        SQL);

        // Retention raw 90 hari (aggregate tetap tersimpan)
        DB::statement("SELECT add_retention_policy('fill_snapshots', INTERVAL '90 days')");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql' || ! $this->timescaleAvailable()) {
            return;
        }

        DB::statement("SELECT remove_retention_policy('fill_snapshots', if_exists => true)");
        DB::statement('DROP MATERIALIZED VIEW IF EXISTS fill_hourly');
    }

    private function timescaleAvailable(): bool
    {
        return DB::selectOne("SELECT 1 AS ok FROM pg_extension WHERE extname = 'timescaledb'") !== null;
    }
};
