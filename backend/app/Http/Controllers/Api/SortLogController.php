<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SortLogResource;
use App\Models\SortLog;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;

class SortLogController extends Controller
{
    /**
     * GET /sort-logs — lintas unit (scoped), filter unit_id/is_correct/from/to.
     * Menyertakan ringkasan akurasi periode terfilter untuk header halaman.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $validated = $request->validate([
            'unit_id' => ['nullable', 'exists:units,id'],
            'is_correct' => ['nullable', 'boolean'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
        ]);

        // Ringkasan akurasi dihitung dari periode/unit terfilter TANPA filter
        // is_correct — kalau ikut, filter "salah saja" selalu 0% (tak bermakna).
        $period = SortLog::query()
            ->whereHas('unit', fn ($q) => $q->forUser($request->user()))
            ->when($validated['unit_id'] ?? null, fn ($q, $unitId) => $q->where('unit_id', $unitId))
            ->when($validated['from'] ?? null, fn ($q, $from) => $q->where('created_at', '>=', Carbon::parse($from)))
            ->when($validated['to'] ?? null, fn ($q, $to) => $q->where('created_at', '<=', Carbon::parse($to)));

        $base = (clone $period)
            ->when(array_key_exists('is_correct', $validated) && $validated['is_correct'] !== null,
                fn ($q) => $q->where('is_correct', $request->boolean('is_correct')));

        $scored = (clone $period)->whereNotNull('is_correct');
        $totalScored = (clone $scored)->count();

        $logs = $base->with(['quizItem', 'unit'])
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->integer('per_page', 15), 100));

        return SortLogResource::collection($logs)->additional([
            'summary' => [
                'total_scored' => $totalScored,
                'correct' => $correct = (clone $scored)->where('is_correct', true)->count(),
                'accuracy' => $totalScored === 0 ? null : round($correct / $totalScored * 100, 1),
            ],
        ]);
    }
}
