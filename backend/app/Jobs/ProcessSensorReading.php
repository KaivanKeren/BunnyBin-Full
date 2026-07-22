<?php

namespace App\Jobs;

use App\Models\Unit;
use App\Services\DeviceIngestService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Pintu masuk MQTT. Isi logikanya ada di DeviceIngestService supaya identik
 * dengan pintu masuk HTTP (KioskIngestController).
 */
class ProcessSensorReading implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public string $unitCode,
        public string $channel,
        public array $payload,
    ) {}

    public function handle(DeviceIngestService $ingest): void
    {
        $unit = Unit::where('code', $this->unitCode)->first();

        // JANGAN throw — hindari retry loop untuk pesan yang memang tak valid.
        if ($unit === null) {
            Log::warning("MQTT: unit_code tidak dikenal: {$this->unitCode}");

            return;
        }

        $ingest->markSeen($unit);

        match ($this->channel) {
            'sensor' => $ingest->recordSensor($unit, $this->payload),
            'sort' => $ingest->recordSort($unit, $this->payload),
            'heartbeat' => null, // markSeen() sudah menangani seluruh maknanya
            default => Log::debug("MQTT: channel diabaikan: {$this->channel}"),
        };
    }
}
