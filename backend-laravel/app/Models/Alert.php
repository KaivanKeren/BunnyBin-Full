<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Alert extends Model
{
    public const UPDATED_AT = null;

    public const TYPE_FILL_70 = 'fill_70';
    public const TYPE_FILL_90 = 'fill_90';
    public const TYPE_OFFLINE = 'offline';
    public const TYPE_MAINTENANCE = 'maintenance';

    protected $fillable = [
        'unit_id',
        'alert_type',
        'message',
        'is_read',
    ];

    protected function casts(): array
    {
        return [
            'is_read' => 'boolean',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
