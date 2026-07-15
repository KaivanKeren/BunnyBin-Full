<?php

namespace App\Jobs;

use App\Models\QuizItem;
use App\Models\Unit;
use App\Services\AlertEngineService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

class ProcessSensorReading implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public string $unitCode,
        public string $channel,
        public array $payload,
    ) {}

    public function handle(AlertEngineService $alerts): void
    {
        $unit = Unit::where('code', $this->unitCode)->first();

        // JANGAN throw — hindari retry loop untuk pesan yang memang tak valid.
        if ($unit === null) {
            Log::warning("MQTT: unit_code tidak dikenal: {$this->unitCode}");

            return;
        }

        // Pesan apa pun dari unit = tanda hidup.
        $unit->forceFill(['last_seen_at' => now()])->save();

        match ($this->channel) {
            'sensor' => $this->handleSensor($unit, $alerts),
            'sort' => $this->handleSort($unit),
            'heartbeat' => $this->handleHeartbeat($unit),
            default => Log::debug("MQTT: channel diabaikan: {$this->channel}"),
        };
    }

    private function handleSensor(Unit $unit, AlertEngineService $alerts): void
    {
        $organic = $this->payload['organic_pct'] ?? null;
        $inorganic = $this->payload['inorganic_pct'] ?? null;

        if (! $this->validPct($organic) || ! $this->validPct($inorganic)) {
            Log::warning("MQTT: payload sensor invalid dari {$unit->code}", $this->payload);

            return;
        }

        $unit->fillSnapshots()->create([
            'organic_pct' => (int) $organic,
            'inorganic_pct' => (int) $inorganic,
            'recorded_at' => $this->timestamp(),
        ]);

        $alerts->evaluateFill($unit, (int) $organic, (int) $inorganic);
    }

    private function handleSort(Unit $unit): void
    {
        $category = $this->payload['category'] ?? null;

        if (! in_array($category, [QuizItem::CATEGORY_ORGANIC, QuizItem::CATEGORY_INORGANIC], true)) {
            Log::warning("MQTT: payload sort invalid dari {$unit->code}", $this->payload);

            return;
        }

        // Mode kuis (kiosk anak): payload menyertakan quiz_item_id → sortiran bisa
        // dinilai benar/salah. Tanpa quiz_item (CV device-side murni), is_correct null.
        $quizItemId = $this->payload['quiz_item_id'] ?? null;
        $quizItem = $quizItemId !== null ? QuizItem::find($quizItemId) : null;

        $isCorrect = match (true) {
            array_key_exists('is_correct', $this->payload) => (bool) $this->payload['is_correct'],
            $quizItem !== null => $category === $quizItem->category,
            default => null,
        };

        $confidence = isset($this->payload['confidence']) && is_numeric($this->payload['confidence'])
            ? (float) $this->payload['confidence']
            : null;

        $unit->sortLogs()->create([
            'quiz_item_id' => $quizItem?->id,
            'category_detected' => $category,
            'confidence' => $confidence,
            'is_correct' => $isCorrect,
            'created_at' => $this->timestamp(),
        ]);
    }

    private function handleHeartbeat(Unit $unit): void
    {
        if ($unit->status === Unit::STATUS_OFFLINE) {
            $unit->update(['status' => Unit::STATUS_ACTIVE]);
        }
    }

    private function validPct(mixed $value): bool
    {
        return is_numeric($value) && (int) $value >= 0 && (int) $value <= 100;
    }

    private function timestamp(): Carbon
    {
        try {
            return isset($this->payload['ts']) ? Carbon::parse($this->payload['ts']) : now();
        } catch (\Throwable) {
            return now();
        }
    }
}
