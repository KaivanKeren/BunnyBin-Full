<?php

namespace App\Console\Commands;

use App\Models\FillSnapshot;
use App\Models\MaintenanceEvent;
use App\Models\QuizItem;
use App\Models\Unit;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use PhpMqtt\Client\Facades\MQTT;

/**
 * Simulator "IoT" — pengganti hardware fisik yang belum ada. Untuk tiap unit
 * ACTIVE ia mem-publish pesan MQTT (bunnybin/{code}/{sensor|sort|heartbeat})
 * PERSIS seperti device sungguhan, sehingga mengalir lewat pipeline nyata:
 * mqtt:listen → ProcessSensorReading → DB → dashboard. Tidak menulis DB langsung
 * (kecuali event pengosongan oleh "petugas"), supaya simulasi benar-benar akurat.
 *
 * Butuh: broker MQTT (mosquitto) + mqtt:listen + queue:work berjalan.
 */
class SimulateDevices extends Command
{
    protected $signature = 'simulate:devices
        {--interval=5 : Jeda detik antar tick}
        {--once : Jalankan satu tick lalu berhenti (untuk uji)}';

    protected $description = 'Simulasikan device BunnyBin dengan mem-publish MQTT ke pipeline nyata (tanpa hardware)';

    /** @var array<string, array{organic:int, inorganic:int}> state fill per unit code */
    private array $fill = [];

    public function handle(): int
    {
        $quizItems = QuizItem::where('active', true)->get();

        if ($quizItems->isEmpty()) {
            $this->error('Tidak ada quiz item aktif — jalankan db:seed dulu.');

            return self::FAILURE;
        }

        $this->info('Simulator device BunnyBin aktif (Ctrl+C untuk berhenti). '.
            'Publish ke broker MQTT tiap '.$this->option('interval').' detik.');

        do {
            $units = Unit::where('status', Unit::STATUS_ACTIVE)->get();

            if ($units->isEmpty()) {
                $this->warn('Tidak ada unit ACTIVE untuk disimulasikan.');
            }

            foreach ($units as $unit) {
                $this->tickUnit($unit, $quizItems);
            }

            if ($this->option('once')) {
                break;
            }

            sleep(max(1, (int) $this->option('interval')));
        } while (true);

        return self::SUCCESS;
    }

    /**
     * @param  Collection<int, QuizItem>  $quizItems
     */
    private function tickUnit(Unit $unit, Collection $quizItems): void
    {
        try {
            $state = $this->fillState($unit);

            // Naik bertahap; bila hampir penuh, "petugas" mengosongkan bin.
            $emptied = false;
            foreach (['organic', 'inorganic'] as $key) {
                if ($state[$key] >= 92) {
                    $state[$key] = random_int(3, 8);
                    $emptied = true;
                } else {
                    $state[$key] = min(100, $state[$key] + random_int(0, 4));
                }
            }
            $this->fill[$unit->code] = $state;

            $this->publish($unit, 'sensor', [
                'organic_pct' => $state['organic'],
                'inorganic_pct' => $state['inorganic'],
                'ts' => now()->toIso8601String(),
            ]);

            // Pengosongan oleh petugas dicatat sebagai maintenance event (bukan data device).
            if ($emptied && random_int(1, 100) <= 35) {
                MaintenanceEvent::create([
                    'unit_id' => $unit->id,
                    'event_type' => 'manual_reset',
                    'note' => 'Bin dikosongkan petugas kebersihan.',
                    'resolved' => true,
                ]);
            }

            // ~70% tick: seorang anak menyortir (mode kuis) → sort log ternilai.
            if (random_int(1, 100) <= 70) {
                $item = $quizItems->random();
                $isCorrect = random_int(1, 100) <= 82;
                $detected = $isCorrect
                    ? $item->category
                    : ($item->category === QuizItem::CATEGORY_ORGANIC
                        ? QuizItem::CATEGORY_INORGANIC
                        : QuizItem::CATEGORY_ORGANIC);

                $this->publish($unit, 'sort', [
                    'category' => $detected,
                    'quiz_item_id' => $item->id,
                    'is_correct' => $isCorrect,
                    'confidence' => random_int(60, 99) / 100,
                    'ts' => now()->toIso8601String(),
                ]);
            }

            // ~30% tick: heartbeat murni (tanda hidup tanpa event).
            if (random_int(1, 100) <= 30) {
                $this->publish($unit, 'heartbeat', ['ts' => now()->toIso8601String()]);
            }

            $this->line(sprintf(
                '  [%s] %s → organik %d%% / anorganik %d%%%s',
                now()->format('H:i:s'),
                $unit->code,
                $state['organic'],
                $state['inorganic'],
                $emptied ? ' (dikosongkan)' : '',
            ));
        } catch (\Throwable $e) {
            $this->warn("Gagal publish untuk {$unit->code}: {$e->getMessage()}");
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function publish(Unit $unit, string $channel, array $payload): void
    {
        MQTT::publish("bunnybin/{$unit->code}/{$channel}", json_encode($payload));
    }

    /**
     * @return array{organic:int, inorganic:int}
     */
    private function fillState(Unit $unit): array
    {
        if (isset($this->fill[$unit->code])) {
            return $this->fill[$unit->code];
        }

        // Lanjutkan dari snapshot terakhir agar mulus dengan data seeder.
        $latest = FillSnapshot::where('unit_id', $unit->id)
            ->orderByDesc('recorded_at')
            ->first(['organic_pct', 'inorganic_pct']);

        return $this->fill[$unit->code] = [
            'organic' => $latest->organic_pct ?? random_int(5, 20),
            'inorganic' => $latest->inorganic_pct ?? random_int(5, 20),
        ];
    }
}
