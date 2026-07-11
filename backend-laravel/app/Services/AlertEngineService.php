<?php

namespace App\Services;

use App\Models\Alert;
use App\Models\Unit;

class AlertEngineService
{
    /**
     * Threshold per kompartemen: >=90 → fill_90, >=70 → fill_70.
     * Dedup: skip jika sudah ada alert sejenis yang belum dibaca dalam 1 jam
     * terakhir (hindari spam saat sensor lapor tiap 30 menit).
     */
    public function evaluateFill(Unit $unit, int $organicPct, int $inorganicPct): void
    {
        $this->evaluateCompartment($unit, 'organik', $organicPct);
        $this->evaluateCompartment($unit, 'anorganik', $inorganicPct);
    }

    public function evaluateOffline(Unit $unit): void
    {
        if ($unit->status === Unit::STATUS_OFFLINE) {
            return;
        }

        if ($unit->last_seen_at !== null && $unit->last_seen_at->greaterThan(now()->subMinutes(15))) {
            return;
        }

        $unit->update(['status' => Unit::STATUS_OFFLINE]);

        $this->createAlert($unit, Alert::TYPE_OFFLINE,
            "Unit {$unit->code} tidak mengirim data lebih dari 15 menit.");
    }

    /**
     * Dipanggil scheduler tiap 5 menit — tandai unit yang diam >15 menit.
     */
    public function sweepOffline(): void
    {
        Unit::where('status', '!=', Unit::STATUS_OFFLINE)
            ->where(fn ($q) => $q
                ->where('last_seen_at', '<', now()->subMinutes(15))
                ->orWhereNull('last_seen_at'))
            ->get()
            ->each(fn (Unit $unit) => $this->evaluateOffline($unit));
    }

    private function evaluateCompartment(Unit $unit, string $label, int $pct): void
    {
        $type = match (true) {
            $pct >= 90 => Alert::TYPE_FILL_90,
            $pct >= 70 => Alert::TYPE_FILL_70,
            default => null,
        };

        if ($type === null || $this->hasRecentUnread($unit, $type)) {
            return;
        }

        $this->createAlert($unit, $type,
            "Kompartemen {$label} unit {$unit->code} terisi {$pct}%.");
    }

    private function hasRecentUnread(Unit $unit, string $type): bool
    {
        return Alert::where('unit_id', $unit->id)
            ->where('alert_type', $type)
            ->where('is_read', false)
            ->where('created_at', '>', now()->subHour())
            ->exists();
    }

    private function createAlert(Unit $unit, string $type, string $message): void
    {
        Alert::create([
            'unit_id' => $unit->id,
            'alert_type' => $type,
            'message' => $message,
        ]);
    }
}
