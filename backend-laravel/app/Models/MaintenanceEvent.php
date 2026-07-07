<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

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
