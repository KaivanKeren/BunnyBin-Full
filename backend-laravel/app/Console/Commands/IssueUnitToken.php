<?php

namespace App\Console\Commands;

use App\Models\Unit;
use Illuminate\Console\Command;

class IssueUnitToken extends Command
{
    protected $signature = 'unit:token {code : Kode unit, ex: BNB-001}';

    protected $description = 'Terbitkan Sanctum token kiosk untuk sebuah unit (dipasang di device)';

    public function handle(): int
    {
        $unit = Unit::where('code', $this->argument('code'))->first();

        if ($unit === null) {
            $this->error("Unit {$this->argument('code')} tidak ditemukan.");

            return self::FAILURE;
        }

        // Satu token aktif per device — cabut yang lama.
        $unit->tokens()->where('name', 'kiosk')->delete();

        $token = $unit->createToken('kiosk', ['kiosk']);

        $this->info("Token kiosk untuk {$unit->code}:");
        $this->line($token->plainTextToken);

        return self::SUCCESS;
    }
}
