<?php

namespace App\Models;

use App\Models\Concerns\BelongsToSchoolScope;
use Illuminate\Auth\Authenticatable;
use Illuminate\Contracts\Auth\Authenticatable as AuthenticatableContract;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Laravel\Sanctum\HasApiTokens;

class Unit extends Model implements AuthenticatableContract
{
    // Authenticatable + HasApiTokens: kiosk di tiap bin autentikasi pakai
    // token unit (ability 'kiosk') via guard Sanctum, bukan akun admin.
    use Authenticatable, BelongsToSchoolScope, HasApiTokens, HasFactory;

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

    /**
     * Subquery per kolom, bukan eager load seluruh snapshot — hindari N+1
     * di tabel time-series yang barisnya jutaan.
     */
    public function scopeWithLatestFill(Builder $query): Builder
    {
        $latest = fn (string $column) => FillSnapshot::select($column)
            ->whereColumn('unit_id', 'units.id')
            ->orderByDesc('recorded_at')
            ->limit(1);

        return $query->addSelect([
            'latest_organic_pct' => $latest('organic_pct'),
            'latest_inorganic_pct' => $latest('inorganic_pct'),
            'latest_recorded_at' => $latest('recorded_at'),
        ]);
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
