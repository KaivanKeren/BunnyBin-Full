<?php

namespace App\Console\Commands;

use App\Models\Unit;
use App\Models\UnitActivationCode;
use Illuminate\Console\Command;

class IssueActivationCode extends Command
{
    protected $signature = 'unit:activation-code
        {code : Kode unit, ex: BNX-001}
        {--hours= : Masa berlaku kode dalam jam (default 24)}';

    protected $description = 'Terbitkan kode aktivasi sekali pakai untuk dipasang di kiosk (menggantikan token di .env)';

    public function handle(): int
    {
        $unit = Unit::where('code', $this->argument('code'))->first();

        if ($unit === null) {
            $this->error("Unit {$this->argument('code')} tidak ditemukan.");

            return self::FAILURE;
        }

        $hours = (int) ($this->option('hours') ?: UnitActivationCode::DEFAULT_TTL_HOURS);

        if ($hours < 1) {
            $this->error('--hours minimal 1.');

            return self::FAILURE;
        }

        $plain = UnitActivationCode::issueFor($unit, $hours);

        $this->newLine();
        $this->info("Kode aktivasi untuk {$unit->code}:");
        $this->line("  <fg=black;bg=green;options=bold> {$plain} </>");
        $this->newLine();
        $this->line("  Berlaku {$hours} jam · SEKALI PAKAI");
        $this->line('  Masukkan di layar aktivasi kiosk. Kode lama unit ini otomatis dibatalkan,');
        $this->line('  dan token kiosk lama dicabut begitu kode ini ditukar.');
        $this->newLine();

        return self::SUCCESS;
    }
}
