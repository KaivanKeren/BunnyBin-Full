<?php

namespace App\Console\Commands;

use App\Jobs\ProcessSensorReading;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\Contracts\MqttClient;
use PhpMqtt\Client\Facades\MQTT;

class MqttListen extends Command
{
    protected $signature = 'mqtt:listen';

    protected $description = 'Subscribe binexa/+/# dan dispatch job ingestion untuk tiap pesan';

    public function handle(): int
    {
        // Loop luar = reconnect: broker restart / koneksi putus tidak boleh
        // mematikan worker (PRD-Backend §5.1).
        while (true) {
            $mqtt = null;

            try {
                $mqtt = MQTT::connection();

                $mqtt->subscribe('binexa/+/#', function (string $topic, string $message) {
                    $this->dispatchMessage($topic, $message);
                }, 1);

                $this->info('MQTT listener tersambung, menunggu pesan...');
                $mqtt->loop(true);
            } catch (\Throwable $e) {
                Log::error('MQTT listener error, reconnect dalam 5 detik: '.$e->getMessage());
            } finally {
                $this->closeQuietly($mqtt);
            }

            sleep(5);
        }
    }

    /**
     * Tutup koneksi sebelum iterasi berikutnya membuat/mengambilnya lagi.
     *
     * MQTT::connection() mengembalikan instance yang DI-CACHE facade. Tanpa
     * penutupan ini, error yang tidak memutus soket sepenuhnya membuat iterasi
     * berikutnya memanggil subscribe() pada koneksi yang SAMA — handler yang
     * sama terdaftar dua kali, lalu tiga kali, dan seterusnya. Akibatnya satu
     * pesan sensor men-dispatch beberapa job sekaligus, dan tabel fill_snapshots
     * serta sort_logs menerima baris duplikat untuk satu kejadian yang sama.
     *
     * Duplikat itu tidak melanggar constraint apa pun, jadi ia tidak muncul
     * sebagai error — hanya sebagai grafik yang "terlihat aneh" berminggu-minggu
     * kemudian.
     *
     * Kegagalan menutup TIDAK boleh menghentikan loop: memutus koneksi yang
     * memang sudah mati akan melempar, dan itu justru kondisi paling umum di
     * sini. Yang penting instance-nya dilepas.
     */
    private function closeQuietly(?MqttClient $mqtt): void
    {
        if ($mqtt === null) {
            return;
        }

        try {
            if ($mqtt->isConnected()) {
                $mqtt->disconnect();
            }
        } catch (\Throwable $e) {
            Log::debug('MQTT: gagal menutup koneksi lama (diabaikan): '.$e->getMessage());
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
