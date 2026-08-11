<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Satu baris = satu interaksi anak dengan kiosk.
 *
 * TUMBUH SELAMANYA, dan itu keputusan yang disengaja. Hypertable saudaranya
 * (`fill_snapshots`) punya retensi 90 hari; tabel ini tidak — perbedaan yang
 * pantas dijelaskan, karena tanpa penjelasan ia terbaca sebagai kelalaian.
 *
 * Pembacaan sensor kehilangan nilainya begitu diringkas jadi rata-rata per jam.
 * Log sortir tidak: justru rekaman jangka panjang inilah produknya — sekolah
 * ingin melihat akurasi pemilahan naik dari tahun ke tahun. Menghapusnya
 * menghancurkan cerita yang jadi alasan sistem ini dibangun.
 *
 * Biayanya terukur: 204 byte/baris termasuk index, jadi satu unit ≈ 2–8 MB per
 * tahun ajaran. Alasan lengkap dan ambang peninjauan ulang ada di migration
 * 2026_07_07_100009 (tempat kebijakan retensi `fill_snapshots` dipasang).
 */
class SortLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'unit_id',
        'quiz_item_id',
        'category_detected',
        'confidence',
        'is_correct',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'is_correct' => 'boolean',
            'confidence' => 'float',
            'created_at' => 'datetime',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function quizItem(): BelongsTo
    {
        return $this->belongsTo(QuizItem::class);
    }
}
