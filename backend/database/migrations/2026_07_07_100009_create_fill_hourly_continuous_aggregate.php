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

        // `sort_logs` SENGAJA TIDAK diberi retensi, dan itu bukan kelalaian.
        //
        // Keduanya hypertable, jadi perlakuan yang berbeda ini pantas dijelaskan
        // di tempat perbandingannya terlihat:
        //
        //   fill_snapshots — pembacaan sensor tiap 30 menit, nilainya habis
        //     begitu diringkas. Yang berguna jangka panjang adalah rata-rata per
        //     jam, dan itu sudah disimpan `fill_hourly`. Baris mentahnya boleh
        //     dibuang.
        //
        //   sort_logs — satu baris = satu interaksi anak dengan kiosk. Justru
        //     rekaman jangka panjang inilah produknya: sekolah ingin melihat
        //     akurasi pemilahan naik dari tahun ke tahun. Menghapusnya
        //     menghancurkan cerita yang jadi alasan sistem ini dibangun.
        //
        // Biayanya terukur, bukan diterka: 204 byte/baris (termasuk index, diukur
        // pada 20.000 baris di TimescaleDB 2.28). Satu unit ≈ 10–40 ribu baris
        // per tahun ajaran → 2–8 MB/tahun. Pada 100 unit ≈ 200–800 MB/tahun.
        //
        // Tinjau ulang bila melewati ~10 GB (sekitar 12 tahun pada 100 unit):
        // saat itu jalannya adalah continuous aggregate HARIAN + retensi pada
        // tabel mentah — TAPI agregat itu harus sekaligus dibaca
        // DashboardController dan SortLogController. Agregat yang tidak dibaca
        // siapa pun persis kesalahan yang sempat terjadi pada `fill_hourly`.
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
