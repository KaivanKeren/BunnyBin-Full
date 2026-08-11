<?php

namespace App\Services;

use App\Models\FillSnapshot;
use App\Models\QuizItem;
use App\Models\SortLog;
use App\Models\Unit;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Satu-satunya tempat data device diterjemahkan jadi baris DB. Dipakai dua
 * pintu masuk yang harus berperilaku identik:
 *
 *   1. MQTT  → ProcessSensorReading (device yang punya koneksi broker)
 *   2. HTTP  → KioskIngestController (kiosk merelay ESP32 lokalnya)
 *
 * Kalau logika ini disalin ke masing-masing pintu, konversi jarak→persen dan
 * aturan alert akan bergeser diam-diam di antara keduanya, dan angka di kiosk
 * berbeda dengan angka di dashboard admin.
 */
class DeviceIngestService
{
    public function __construct(private AlertEngineService $alerts) {}

    /**
     * Pesan apa pun dari unit = tanda hidup. Unit yang sempat ditandai offline
     * otomatis aktif lagi begitu datanya mengalir.
     */
    public function markSeen(Unit $unit): void
    {
        $unit->forceFill([
            'last_seen_at' => now(),
            'status' => $unit->status === Unit::STATUS_OFFLINE ? Unit::STATUS_ACTIVE : $unit->status,
        ])->save();
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return FillSnapshot|null null bila pembacaan tidak sahih (sensor error / payload invalid)
     */
    public function recordSensor(Unit $unit, array $payload): ?FillSnapshot
    {
        $organic = $this->readCompartment($unit, $payload, 'organic', 'organik');
        $inorganic = $this->readCompartment($unit, $payload, 'inorganic', 'anorganik');

        // Satu kompartemen gagal dibaca = snapshot tidak utuh. Lebih baik tidak
        // ada data daripada data setengah benar yang memicu alert palsu.
        if ($organic === null || $inorganic === null) {
            return null;
        }

        $snapshot = $unit->fillSnapshots()->create([
            'organic_pct' => $organic['pct'],
            'inorganic_pct' => $inorganic['pct'],
            'organic_distance_cm' => $organic['distance_cm'],
            'inorganic_distance_cm' => $inorganic['distance_cm'],
            'recorded_at' => $this->timestamp($unit, $payload),
        ]);

        $this->alerts->evaluateFill($unit, $organic['pct'], $inorganic['pct']);

        return $snapshot;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return SortLog|null null bila payload tidak bisa dinilai sama sekali
     */
    public function recordSort(Unit $unit, array $payload): ?SortLog
    {
        $category = $payload['category'] ?? null;

        if (! in_array($category, [QuizItem::CATEGORY_ORGANIC, QuizItem::CATEGORY_INORGANIC], true)) {
            $category = null;
        }

        $quizItemId = $payload['quiz_item_id'] ?? null;
        $quizItem = $quizItemId !== null ? QuizItem::find($quizItemId) : null;

        // Kategori null masih berguna kalau ada quiz item: itu kasus CV gagal
        // dan anak menjawab manual — jawabannya tetap layak dicatat. Tanpa
        // keduanya tidak ada yang bisa disimpulkan.
        if ($category === null && $quizItem === null) {
            Log::warning("Ingest: payload sort invalid dari {$unit->code}", $payload);

            return null;
        }

        $isCorrect = match (true) {
            array_key_exists('is_correct', $payload) && $payload['is_correct'] !== null => (bool) $payload['is_correct'],
            $category !== null && $quizItem !== null => $category === $quizItem->category,
            default => null,
        };

        return $unit->sortLogs()->create([
            'quiz_item_id' => $quizItem?->id,
            'category_detected' => $category,
            'confidence' => isset($payload['confidence']) && is_numeric($payload['confidence'])
                ? (float) $payload['confidence']
                : null,
            'is_correct' => $isCorrect,
            'created_at' => $this->timestamp($unit, $payload),
        ]);
    }

    /**
     * Device mengirim jarak mentah ({key}_distance_cm) dan backend yang
     * mengonversi memakai geometri unit — supaya kalibrasi bisa diubah dari
     * dashboard tanpa flash ulang firmware. Payload lama ({key}_pct) tetap
     * diterima demi simulator dan unit yang belum di-update.
     *
     * @param  array<string, mixed>  $payload
     * @return array{pct:int, distance_cm:float|null}|null null bila invalid atau sensor error
     */
    private function readCompartment(Unit $unit, array $payload, string $key, string $label): ?array
    {
        $distance = $payload["{$key}_distance_cm"] ?? null;

        if ($distance !== null) {
            if (! is_numeric($distance)) {
                Log::warning("Ingest: jarak sensor invalid dari {$unit->code}", $payload);

                return null;
            }

            $distance = round((float) $distance, 1);
            $pct = $unit->fillPctFromDistance($distance);

            if ($pct === null) {
                $this->alerts->reportSensorFault($unit, $label, $distance);

                return null;
            }

            return ['pct' => $pct, 'distance_cm' => $distance];
        }

        $pct = $payload["{$key}_pct"] ?? null;

        if (! is_numeric($pct) || (int) $pct < 0 || (int) $pct > 100) {
            Log::warning("Ingest: payload sensor invalid dari {$unit->code}", $payload);

            return null;
        }

        return ['pct' => (int) $pct, 'distance_cm' => null];
    }

    /**
     * Waktu kejadian menurut device, DIBATASI ke rentang yang masuk akal.
     *
     * `recorded_at` dan `created_at` adalah kolom partisi hypertable TimescaleDB.
     * Satu baris bertanggal 2099 memaksa pembuatan chunk yang jauh di luar
     * rentang normal, membuat grafik ter-skala habis oleh satu outlier, dan bisa
     * membuat kebijakan retensi berperilaku tak terduga.
     *
     * DINORMALISASI, BUKAN DITOLAK — ini keputusan yang disengaja. Penyebab
     * paling mungkin dari ts yang melenceng bukan serangan, melainkan tablet
     * kiosk yang jam sistemnya belum sinkron NTP setelah reboot. Menolaknya
     * dengan 422 berarti kiosk menandainya CloudRejectedError (api/errors.ts:39
     * — 422 tidak termasuk RETRYABLE_STATUSES) lalu MEMBUANG payload itu
     * selamanya. Sortiran anak hilang seluruhnya gara-gara jam yang salah.
     *
     * Jatuh ke now() menyelamatkan datanya; log warning membuat jam yang
     * melenceng tetap terlihat, bukan tersembunyi.
     *
     * @param  array<string, mixed>  $payload
     */
    private function timestamp(Unit $unit, array $payload): Carbon
    {
        if (! isset($payload['ts'])) {
            return now();
        }

        try {
            $ts = Carbon::parse($payload['ts']);
        } catch (\Throwable) {
            Log::warning("Ingest: ts tidak bisa diurai dari {$unit->code}, dipakai waktu server", [
                'ts' => $payload['ts'],
            ]);

            return now();
        }

        // Batas masa lalu longgar (30 hari): antrean retry kiosk menyimpan sampai
        // 500 entri dan bertahan melewati reboot, jadi log yang benar-benar sah
        // bisa tiba berhari-hari terlambat. Yang ingin dicegah bukan itu,
        // melainkan tanggal absurd (1970 / 2099) yang merusak partisi.
        //
        // Batas masa depan ketat (5 menit): tidak ada alasan sah bagi device
        // melaporkan masa depan selain jam yang salah; 5 menit hanya memberi
        // kelonggaran untuk selisih jam wajar antar-mesin.
        if ($ts->greaterThan(now()->addMinutes(5)) || $ts->lessThan(now()->subDays(30))) {
            Log::warning("Ingest: ts di luar rentang wajar dari {$unit->code}, dipakai waktu server", [
                'ts' => $ts->toIso8601String(),
                'server_now' => now()->toIso8601String(),
            ]);

            return now();
        }

        return $ts;
    }
}
