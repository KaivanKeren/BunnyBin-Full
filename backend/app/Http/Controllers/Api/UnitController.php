<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUnitRequest;
use App\Http\Requests\UpdateUnitRequest;
use App\Http\Resources\SortLogResource;
use App\Http\Resources\UnitResource;
use App\Models\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UnitController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $units = Unit::forUser($request->user())
            ->with('school')
            ->withLatestFill()
            ->orderBy('code')
            ->paginate(min((int) $request->integer('per_page', 15), 100));

        return UnitResource::collection($units);
    }

    public function store(StoreUnitRequest $request): UnitResource
    {
        return new UnitResource(Unit::create($request->validated())->load('school'));
    }

    public function show(Request $request, string $unit): UnitResource
    {
        $unit = Unit::forUser($request->user())
            ->with('school')
            ->withLatestFill()
            ->findOrFail($unit);

        $unit->load(['maintenanceEvents' => fn ($q) => $q->latest()->limit(10)]);

        return new UnitResource($unit);
    }

    public function update(UpdateUnitRequest $request, Unit $unit): UnitResource
    {
        $unit->update($request->validated());

        return new UnitResource($unit->load('school'));
    }

    public function destroy(Unit $unit): Response
    {
        $unit->delete();

        return response()->noContent();
    }

    /**
     * GET /units/{id}/fill-history?from=&to=&interval=raw|hourly
     *
     * Dua batas rentang, dan alasannya berbeda:
     *
     *   raw    31 hari — batas UKURAN PAYLOAD, bukan batas ketersediaan data.
     *                    Data mentah bertahan 90 hari, tapi 90 hari pembacaan
     *                    tiap 30 menit ≈ 4.300 titik per unit: tidak ada grafik
     *                    yang menampilkan itu secara berguna, dan interval
     *                    hourly memang ada untuk rentang panjang. Sengaja tidak
     *                    dinaikkan ke 90.
     *   hourly 366 hari — sekarang benar-benar didukung. Sebelumnya ini janji
     *                    kosong: agregasinya dihitung dari tabel mentah yang
     *                    dihapus retensi setelah 90 hari, jadi permintaan
     *                    setahun mengembalikan array kosong untuk 9 bulan
     *                    pertamanya. Sejak membaca `fill_hourly`, agregatnya
     *                    yang tidak punya retensi sendiri, datanya bertahan.
     */
    public function fillHistory(Request $request, string $unit): JsonResponse
    {
        $unit = Unit::forUser($request->user())->findOrFail($unit);

        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'interval' => ['nullable', 'in:raw,hourly'],
        ]);

        $interval = $validated['interval'] ?? 'raw';
        $to = isset($validated['to']) ? Carbon::parse($validated['to']) : now();
        $from = isset($validated['from']) ? Carbon::parse($validated['from']) : $to->copy()->subDay();

        if ($from->greaterThan($to)) {
            throw ValidationException::withMessages(['from' => 'Tanggal awal harus sebelum tanggal akhir.']);
        }

        $maxDays = $interval === 'raw' ? 31 : 366;
        if ($from->diffInDays($to) > $maxDays) {
            throw ValidationException::withMessages([
                'from' => "Rentang maksimal {$maxDays} hari untuk interval {$interval}.",
            ]);
        }

        $data = $interval === 'raw'
            ? $unit->fillSnapshots()
                ->whereBetween('recorded_at', [$from, $to])
                ->orderBy('recorded_at')
                ->get([
                    'organic_pct', 'inorganic_pct',
                    'organic_distance_cm', 'inorganic_distance_cm',
                    'recorded_at',
                ])
            : $this->hourlyData($unit, $from, $to);

        return response()->json([
            'unit_id' => $unit->id,
            'interval' => $interval,
            'from' => $from->toISOString(),
            'to' => $to->toISOString(),
            'data' => $data,
        ]);
    }

    /**
     * GET /units/{id}/sort-logs?is_correct=&from=&to= (paginated)
     */
    public function sortLogs(Request $request, string $unit): AnonymousResourceCollection
    {
        $unit = Unit::forUser($request->user())->findOrFail($unit);

        $validated = $request->validate([
            'is_correct' => ['nullable', 'boolean'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        $logs = $unit->sortLogs()
            ->with('quizItem')
            ->when(array_key_exists('is_correct', $validated) && $validated['is_correct'] !== null,
                fn ($q) => $q->where('is_correct', $request->boolean('is_correct')))
            ->when($validated['from'] ?? null, fn ($q, $from) => $q->where('created_at', '>=', Carbon::parse($from)))
            ->when($validated['to'] ?? null, fn ($q, $to) => $q->where('created_at', '<=', Carbon::parse($to)))
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->integer('per_page', 15), 100));

        return SortLogResource::collection($logs);
    }

    /**
     * Rata-rata per jam.
     *
     * Membaca continuous aggregate `fill_hourly` bila TimescaleDB tersedia, dan
     * ini bukan sekadar optimasi — ia yang membuat rentang panjang mungkin sama
     * sekali. Kebijakan retensi menghapus `fill_snapshots` setelah 90 hari,
     * sementara endpoint ini mengizinkan rentang hourly sampai 366 hari. Selama
     * agregasinya dihitung on-the-fly dari tabel mentah, permintaan "1 tahun
     * terakhir" akan mengembalikan array kosong untuk 9 bulan pertamanya —
     * kegagalan yang baru muncul tiga bulan setelah deploy, jauh dari perubahan
     * kode mana pun yang bisa dicurigai.
     *
     * Agregatnya sendiri tidak punya retensi, jadi ia bertahan.
     *
     * @return \Illuminate\Support\Collection<int, object>
     */
    private function hourlyData(Unit $unit, Carbon $from, Carbon $to)
    {
        if ($this->continuousAggregateAvailable()) {
            return DB::table('fill_hourly')
                ->where('unit_id', $unit->id)
                ->whereBetween('bucket', [$from, $to])
                ->orderBy('bucket')
                ->get([
                    'bucket',
                    // Nama kolom view berbeda dari kontrak API (PRD §6) — alias
                    // di sini supaya frontend tidak perlu tahu asal datanya.
                    DB::raw('avg_organic AS avg_organic_pct'),
                    DB::raw('avg_inorganic AS avg_inorganic_pct'),
                ]);
        }

        // Postgres polos (CI) dan SQLite (test): tidak ada agregat, hitung dari
        // tabel mentah. Hasilnya setara — hanya tanpa keawetan melewati retensi.
        return $unit->fillSnapshots()
            ->whereBetween('recorded_at', [$from, $to])
            ->selectRaw($this->hourlyBucketExpression().' AS bucket')
            ->selectRaw('cast(round(avg(organic_pct)) as integer) AS avg_organic_pct')
            ->selectRaw('cast(round(avg(inorganic_pct)) as integer) AS avg_inorganic_pct')
            ->groupBy('bucket')
            ->orderBy('bucket')
            ->get();
    }

    /**
     * Agregat bisa TIDAK ADA meski TimescaleDB terpasang: migration pembuatnya
     * dilewati saat extension belum aktif. Memeriksa keduanya secara terpisah
     * mencegah query ke view yang tidak pernah dibuat.
     */
    private function continuousAggregateAvailable(): bool
    {
        static $available = null;

        if ($available !== null) {
            return $available;
        }

        if (! $this->timescaleAvailable()) {
            return $available = false;
        }

        return $available = DB::selectOne(
            "SELECT 1 AS ok FROM timescaledb_information.continuous_aggregates WHERE view_name = 'fill_hourly'"
        ) !== null;
    }

    /**
     * time_bucket TimescaleDB jika tersedia; fallback portabel untuk
     * Postgres polos (CI) dan SQLite (test).
     */
    private function hourlyBucketExpression(): string
    {
        if (DB::getDriverName() !== 'pgsql') {
            return "strftime('%Y-%m-%d %H:00:00', recorded_at)";
        }

        return $this->timescaleAvailable()
            ? "time_bucket('1 hour', recorded_at)"
            : "date_trunc('hour', recorded_at)";
    }

    /**
     * Pemeriksaan driver ada DI DALAM, bukan diserahkan ke pemanggil.
     *
     * Sebelumnya `hourlyBucketExpression()` menjaganya dari luar, dan penjagaan
     * itu tidak ikut terbawa saat fungsi ini dipanggil dari tempat baru: query
     * `pg_extension` dijalankan di SQLite dan seluruh endpoint balas 500. Tabel
     * katalog Postgres tidak ada di driver lain, jadi satu-satunya tempat aman
     * untuk pemeriksaan ini adalah di sini.
     */
    private function timescaleAvailable(): bool
    {
        static $available = null;

        if ($available !== null) {
            return $available;
        }

        if (DB::getDriverName() !== 'pgsql') {
            return $available = false;
        }

        return $available = DB::selectOne(
            "SELECT 1 AS ok FROM pg_extension WHERE extname = 'timescaledb'"
        ) !== null;
    }
}
