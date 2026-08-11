<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Memperbaiki continuous aggregate `fill_hourly` supaya benar-benar bisa dibaca.
 *
 * Agregat ini dibuat dan dirawat sejak awal, tapi TIDAK PERNAH dibaca satu baris
 * kode pun — endpoint fill-history meng-agregasi tabel mentah secara on-the-fly.
 * Begitu UnitController mulai membacanya, tiga cacat langsung terlihat, dan
 * ketiganya diverifikasi langsung di TimescaleDB 2.28, bukan disimpulkan dari
 * dokumentasi:
 *
 *   1. materialized_only = true (default TimescaleDB modern).
 *      Digabung dengan end_offset 30 menit dan jadwal refresh 30 menit, view
 *      tertinggal sampai ~1 jam dari waktu nyata. Grafik "24 jam terakhir" akan
 *      kehilangan ujung terbarunya — persis bagian yang ditonton guru saat kiosk
 *      sedang dipakai, dan gejalanya terbaca sebagai "datanya berhenti masuk".
 *
 *   2. Data lama tidak pernah termaterialisasi.
 *      start_offset 3 jam berarti job hanya melihat jendela 3 jam ke belakang.
 *      Bucket yang terlewat (broker mati, DB restart, job tertunda) hilang
 *      PERMANEN — tidak ada mekanisme yang kembali menjemputnya.
 *
 *   3. Tidak ada backfill untuk data yang sudah terlanjur ada.
 *      Seluruh riwayat sebelum migration ini tidak akan pernah muncul di view.
 *
 * Diukur pada 31 snapshot yang menjangkau 5 jam: view mengembalikan 1 bucket,
 * agregasi mentah 6. Setelah ketiga perbaikan di bawah: 6 dan 6, nilainya identik.
 */
return new class extends Migration
{
    /** refresh_continuous_aggregate tidak boleh berjalan di dalam transaksi. */
    public $withinTransaction = false;

    public function up(): void
    {
        if (! $this->aggregateAvailable()) {
            return;
        }

        // (1) Real-time aggregation: view menggabungkan bagian termaterialisasi
        // dengan pembacaan langsung tabel mentah untuk rentang terbaru yang
        // belum sempat dimaterialisasi.
        DB::statement('ALTER MATERIALIZED VIEW fill_hourly SET (timescaledb.materialized_only = false)');

        // (2) Perlebar jendela refresh 3 jam → 7 hari. TimescaleDB hanya mengerjakan
        // ulang wilayah yang ditandai invalid, jadi jendela lebar nyaris tidak
        // menambah biaya — tapi ia memberi tiap bucket ratusan kesempatan untuk
        // termaterialisasi, bukan lima. Gangguan sehari tidak lagi meninggalkan
        // lubang permanen di grafik.
        DB::statement("SELECT remove_continuous_aggregate_policy('fill_hourly', if_exists => true)");
        DB::statement(<<<'SQL'
            SELECT add_continuous_aggregate_policy('fill_hourly',
              start_offset => INTERVAL '7 days',
              end_offset   => INTERVAL '30 minutes',
              schedule_interval => INTERVAL '30 minutes')
        SQL);

        // (3) Backfill seluruh riwayat yang sudah ada. NULL,NULL = sejak awal
        // sampai akhir. Sekali jalan; setelah ini kebijakan di atas yang merawat.
        DB::statement("CALL refresh_continuous_aggregate('fill_hourly', NULL, NULL)");
    }

    public function down(): void
    {
        if (! $this->aggregateAvailable()) {
            return;
        }

        DB::statement('ALTER MATERIALIZED VIEW fill_hourly SET (timescaledb.materialized_only = true)');
        DB::statement("SELECT remove_continuous_aggregate_policy('fill_hourly', if_exists => true)");
        DB::statement(<<<'SQL'
            SELECT add_continuous_aggregate_policy('fill_hourly',
              start_offset => INTERVAL '3 hours',
              end_offset   => INTERVAL '30 minutes',
              schedule_interval => INTERVAL '30 minutes')
        SQL);
    }

    /**
     * Migration ini harus tetap sukses di Postgres polos dan SQLite (CI/test),
     * sama seperti migration hypertable lainnya.
     */
    private function aggregateAvailable(): bool
    {
        if (DB::getDriverName() !== 'pgsql') {
            return false;
        }

        if (DB::selectOne("SELECT 1 FROM pg_extension WHERE extname = 'timescaledb'") === null) {
            return false;
        }

        return DB::selectOne(
            "SELECT 1 FROM timescaledb_information.continuous_aggregates WHERE view_name = 'fill_hourly'"
        ) !== null;
    }
};
