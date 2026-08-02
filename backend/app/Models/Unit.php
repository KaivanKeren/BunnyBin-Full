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

    /** Rentang fisik HC-SR04 — di luar ini pembacaan pasti tidak sahih. */
    public const SENSOR_MIN_CM = 2;
    public const SENSOR_MAX_CM = 400;

    /** Kelonggaran di luar rentang teoretis tong sebelum dianggap sensor rusak. */
    public const SENSOR_TOLERANCE_CM = 10;

    protected $fillable = [
        'school_id',
        'code',
        'location_label',
        'status',
        'last_seen_at',
        'installed_at',
        'bin_height_cm',
        'sensor_offset_cm',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'installed_at' => 'date',
            'bin_height_cm' => 'integer',
            'sensor_offset_cm' => 'integer',
        ];
    }

    /**
     * Jarak ultrasonik (cm) → persen terisi. Sensor dipasang di tutup menghadap
     * ke bawah, jadi jarak BERBANDING TERBALIK dengan isi:
     *
     *     [sensor]
     *        │  sensor_offset_cm   ← jarak saat penuh
     *        ├───────────────────── 100%
     *        │  bin_height_cm
     *        └───────────────────── 0%   ← jarak saat kosong = offset + tinggi
     *
     * Mengembalikan null bila pembacaan tidak masuk akal (echo hilang, sensor
     * lepas/mati, geometri unit belum dikalibrasi) — pemanggil yang memutuskan
     * itu jadi alert, bukan data.
     */
    public function fillPctFromDistance(float $distanceCm): ?int
    {
        $height = $this->bin_height_cm;
        $offset = $this->sensor_offset_cm;

        if ($height === null || $height <= 0) {
            return null;
        }

        if ($distanceCm < self::SENSOR_MIN_CM || $distanceCm > self::SENSOR_MAX_CM) {
            return null;
        }

        $empty = $offset + $height;

        // Sedikit di luar rentang teoretis masih wajar (permukaan sampah tidak
        // rata, tutup bergeser) → di-clamp. Jauh di luar = sensor bermasalah.
        if ($distanceCm > $empty + self::SENSOR_TOLERANCE_CM
            || $distanceCm < $offset - self::SENSOR_TOLERANCE_CM) {
            return null;
        }

        $pct = ($empty - $distanceCm) / $height * 100;

        return (int) round(max(0, min(100, $pct)));
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
            'latest_organic_distance_cm' => $latest('organic_distance_cm'),
            'latest_inorganic_distance_cm' => $latest('inorganic_distance_cm'),
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
