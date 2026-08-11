<?php

namespace App\Services;

use App\Models\Alert;
use App\Models\Unit;

class AlertEngineService
{
    /**
     * Threshold per kompartemen: >=90 → fill_90, >=70 → fill_70.
     * Dedup: skip jika sudah ada alert sejenis dalam 1 jam terakhir, DIBACA
     * ATAU TIDAK (hindari spam saat sensor lapor tiap 30 menit).
     */
    public function evaluateFill(Unit $unit, int $organicPct, int $inorganicPct): void
    {
        $this->evaluateCompartment($unit, 'organik', $organicPct);
        $this->evaluateCompartment($unit, 'anorganik', $inorganicPct);
    }

    /**
     * Jarak ultrasonik di luar rentang wajar. Tanpa ini, sensor mati terbaca
     * sebagai "tong kosong terus" dan tidak pernah terdeteksi petugas.
     */
    public function reportSensorFault(Unit $unit, string $label, float $distanceCm): void
    {
        if ($this->hasRecentAlert($unit, Alert::TYPE_SENSOR_FAULT)) {
            return;
        }

        $this->createAlert($unit, Alert::TYPE_SENSOR_FAULT, sprintf(
            'Sensor kompartemen %s unit %s membaca %.1f cm — di luar rentang wajar, periksa sensor atau kalibrasi tong.',
            $label,
            $unit->code,
            $distanceCm,
        ));
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

        if ($type === null || $this->hasRecentAlert($unit, $type)) {
            return;
        }

        $this->createAlert($unit, $type,
            "Kompartemen {$label} unit {$unit->code} terisi {$pct}%.");
    }

    /**
     * Throttle berbasis WAKTU saja — status baca sengaja tidak ikut dinilai.
     *
     * Sebelumnya klausa `is_read = false` ikut di sini, dan itu justru
     * membatalkan maksud throttle-nya: begitu admin menandai alert terbaca —
     * tindakan normal, bahkan tindakan yang diinginkan — pembacaan sensor
     * berikutnya langsung membuat alert baru untuk tong yang sama. Tong penuh
     * yang menunggu dikosongkan menghasilkan alert baru SETIAP KALI admin
     * membersihkan inbox-nya, sehingga membersihkan inbox terasa memancing spam.
     *
     * Status baca adalah urusan UI: ia menandai apakah seseorang sudah MELIHAT
     * pesannya, bukan apakah kondisinya sudah berubah. Jendela satu jam yang
     * memutuskan seberapa sering satu kondisi boleh berbicara.
     */
    private function hasRecentAlert(Unit $unit, string $type): bool
    {
        return Alert::where('unit_id', $unit->id)
            ->where('alert_type', $type)
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
