<?php

namespace App\Console\Commands;

use App\Jobs\ProcessSensorReading;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\Facades\MQTT;

class MqttListen extends Command
{
    protected $signature = 'mqtt:listen';

    protected $description = 'Subscribe bunnybin/+/# dan dispatch job ingestion untuk tiap pesan';

    public function handle(): int
    {
        // Loop luar = reconnect: broker restart / koneksi putus tidak boleh
        // mematikan worker (PRD-Backend §5.1).
        while (true) {
            try {
                $mqtt = MQTT::connection();

                $mqtt->subscribe('bunnybin/+/#', function (string $topic, string $message) {
                    $this->dispatchMessage($topic, $message);
                }, 1);

                $this->info('MQTT listener tersambung, menunggu pesan...');
                $mqtt->loop(true);
            } catch (\Throwable $e) {
                Log::error('MQTT listener error, reconnect dalam 5 detik: '.$e->getMessage());
                sleep(5);
            }
        }
    }

    private function dispatchMessage(string $topic, string $message): void
    {
        $parts = explode('/', $topic);

        if (count($parts) !== 3) {
            Log::debug("MQTT: topik tidak dikenal: {$topic}");

            return;
        }

        [, $unitCode, $channel] = $parts;

        $payload = json_decode($message, true);

        if (! is_array($payload)) {
            Log::warning("MQTT: payload bukan JSON valid di {$topic}");

            return;
        }

        ProcessSensorReading::dispatch($unitCode, $channel, $payload);
    }
}
