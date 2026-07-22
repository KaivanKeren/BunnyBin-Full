<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Unit;
use App\Services\DeviceIngestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Pintu masuk HTTP untuk kiosk yang merelay ESP32 lokalnya (prototype: satu
 * device, tanpa broker MQTT di firmware). Semua rute di sini dilindungi
 * middleware kiosk.unit — unit pemanggil dijamin sama dengan {code} di URL.
 *
 * Konversi jarak→persen sengaja tetap di backend: kiosk mengirim apa yang
 * dibaca sensor, backend yang memutuskan artinya, lalu MENGEMBALIKAN persen
 * hasil hitungannya supaya angka di layar kiosk dan di dashboard admin berasal
 * dari satu perhitungan yang sama.
 */
class KioskIngestController extends Controller
{
    /**
     * POST /units/{code}/fill — relay pembacaan sensor ESP32.
     * Kirim jarak mentah (disarankan) atau persen langsung.
     */
    public function fill(Request $request, DeviceIngestService $ingest): JsonResponse
    {
        $unit = $this->unit($request);

        $payload = $request->validate([
            'organic_distance_cm' => ['required_without:organic_pct', 'numeric'],
            'inorganic_distance_cm' => ['required_without:inorganic_pct', 'numeric'],
            'organic_pct' => ['required_without:organic_distance_cm', 'integer', 'between:0,100'],
            'inorganic_pct' => ['required_without:inorganic_distance_cm', 'integer', 'between:0,100'],
            'ts' => ['nullable', 'date'],
        ]);

        $ingest->markSeen($unit);
        $snapshot = $ingest->recordSensor($unit, $payload);

        // Pembacaan di luar rentang wajar sudah jadi alert sensor_fault di
        // dashboard; kiosk diberi tahu supaya bisa menahan angka lamanya
        // ketimbang menampilkan nilai palsu.
        if ($snapshot === null) {
            return response()->json([
                'error' => 'sensor_reading_rejected',
                'message' => 'Pembacaan sensor di luar rentang wajar dan tidak disimpan.',
            ], 422);
        }

        return response()->json([
            'organic_pct' => $snapshot->organic_pct,
            'inorganic_pct' => $snapshot->inorganic_pct,
            'recorded_at' => $snapshot->recorded_at->toIso8601String(),
        ]);
    }

    /**
     * POST /units/{code}/sort-logs — satu sortiran anak di kiosk.
     * category_detected boleh null (CV gagal / offline) selama ada quiz_item_id.
     */
    public function sortLog(Request $request, DeviceIngestService $ingest): JsonResponse
    {
        $unit = $this->unit($request);

        $validated = $request->validate([
            'quiz_item_id' => ['nullable', 'integer', 'exists:quiz_items,id'],
            'category_detected' => ['nullable', 'in:organic,inorganic'],
            'confidence' => ['nullable', 'numeric', 'between:0,1'],
            'is_correct' => ['nullable', 'boolean'],
            'ts' => ['nullable', 'date'],
        ]);

        $ingest->markSeen($unit);

        $log = $ingest->recordSort($unit, [
            ...$validated,
            'category' => $validated['category_detected'] ?? null,
        ]);

        if ($log === null) {
            return response()->json([
                'error' => 'sort_log_rejected',
                'message' => 'Butuh quiz_item_id atau category_detected yang sahih.',
            ], 422);
        }

        return response()->json(['id' => $log->id], 201);
    }

    /**
     * POST /units/{code}/heartbeat — kiosk hidup tapi tak ada aktivitas.
     * Menahan unit dari ditandai offline oleh sweeper 15 menit.
     */
    public function heartbeat(Request $request, DeviceIngestService $ingest): JsonResponse
    {
        $unit = $this->unit($request);

        $ingest->markSeen($unit);

        return response()->json([
            'status' => $unit->status,
            'server_time' => now()->toIso8601String(),
        ]);
    }

    /**
     * Middleware kiosk.unit sudah memastikan ini Unit milik token pemanggil.
     */
    private function unit(Request $request): Unit
    {
        /** @var Unit */
        return $request->user();
    }
}
