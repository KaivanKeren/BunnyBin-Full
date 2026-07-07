<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSchoolScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Unit extends Model
{
    use BelongsToSchoolScope, HasFactory;

    public const STATUS_ACTIVE = 'active';
    public const STATUS_MAINTENANCE = 'maintenance';
    public const STATUS_OFFLINE = 'offline';

    protected $fillable = [
        'school_id',
        'code',
        'location_label',
        'status',
        'last_seen_at',
        'installed_at',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'installed_at' => 'date',
        ];
    }

    public function school(): BelongsTo
    {
        return $this->belongsTo(School::class);
    }

    public function fillSnapshots(): HasMany
    {
        return $this->hasMany(FillSnapshot::class);
    }

    public function sortLogs(): HasMany
    {
        return $this->hasMany(SortLog::class);
    }

    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    public function maintenanceEvents(): HasMany
    {
        return $this->hasMany(MaintenanceEvent::class);
    }
}
