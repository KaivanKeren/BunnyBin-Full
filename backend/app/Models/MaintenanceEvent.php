<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * FITUR SETENGAH JALAN — jalur BACA sudah ada, jalur TULIS belum.
 *
 * Yang sudah bekerja: UnitController::show memuat 10 event terakhir dan
 * UnitResource mengeksposnya, jadi begitu ada barisnya, ia langsung tampil.
 *
 * Yang BELUM ada: endpoint untuk membuatnya. Satu-satunya yang menulis ke tabel
 * ini adalah `artisan simulate:devices` — artinya di sistem sungguhan tabel ini
 * selalu kosong, dan petugas tidak punya cara mencatat "tong sudah dikosongkan".
 *
 * Ditunda dengan sengaja, bukan terlupakan: menambahkan endpointnya saja tidak
 * menyelesaikan apa pun tanpa UI admin untuk memakainya, dan itu penambahan
 * fitur — bukan perbaikan. Dicatat di sini supaya pembaca berikutnya tahu tabel
 * yang kosong ini bukan tanda ada yang rusak.
 *
 * Untuk menyelesaikannya: POST /units/{unit}/maintenance-events (role
 * school_admin ke atas, di-scope lewat unit) + tombol di halaman UnitDetail.
 */
class MaintenanceEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'unit_id',
        'event_type',
        'note',
        'resolved',
    ];

    protected function casts(): array
    {
        return [
            'resolved' => 'boolean',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
