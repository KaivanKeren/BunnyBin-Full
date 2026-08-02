<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FillSnapshot extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'unit_id',
        'organic_pct',
        'inorganic_pct',
        'organic_distance_cm',
        'inorganic_distance_cm',
        'recorded_at',
    ];

    protected function casts(): array
    {
        return [
            'recorded_at' => 'datetime',
            'organic_pct' => 'integer',
            'inorganic_pct' => 'integer',
            // float, bukan decimal: decimal di-cast jadi string dan bocor ke JSON API
            'organic_distance_cm' => 'float',
            'inorganic_distance_cm' => 'float',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }
}
