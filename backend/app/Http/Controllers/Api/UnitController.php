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
     * raw max 31 hari, hourly max 1 tahun.
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

        $query = $unit->fillSnapshots()->whereBetween('recorded_at', [$from, $to]);

        $data = $interval === 'raw'
            ? $query->orderBy('recorded_at')->get([
                'organic_pct', 'inorganic_pct',
                'organic_distance_cm', 'inorganic_distance_cm',
                'recorded_at',
            ])
            : $query->selectRaw($this->hourlyBucketExpression().' AS bucket')
                ->selectRaw('cast(round(avg(organic_pct)) as integer) AS avg_organic_pct')
                ->selectRaw('cast(round(avg(inorganic_pct)) as integer) AS avg_inorganic_pct')
                ->groupBy('bucket')
                ->orderBy('bucket')
                ->get();

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

    private function timescaleAvailable(): bool
    {
        static $available = null;

        return $available ??= DB::selectOne(
            "SELECT 1 AS ok FROM pg_extension WHERE extname = 'timescaledb'"
        ) !== null;
    }
}
