<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class UnitActivationCode extends Model
{
    use HasFactory;

    /** Berlaku 24 jam — cukup untuk pemasangan di lapangan, tidak lebih. */
    public const DEFAULT_TTL_HOURS = 24;

    /**
     * Alfabet tanpa karakter yang mudah tertukar saat dibaca dari layar lalu
     * diketik di tablet: tanpa 0/O, 1/I/L, 2/Z, 5/S, 8/B. Kode ini diketik
     * manusia satu kali, jadi salah ketik karena huruf mirip adalah kegagalan
     * yang paling mungkin terjadi — bukan serangan.
     */
    private const ALPHABET = '34679ACDEFGHJKMNPQRTUVWXY';

    /** 12 karakter dari 25 simbol ≈ 55 bit. */
    private const LENGTH = 12;

    protected $fillable = [
        'unit_id',
        'code_hash',
        'expires_at',
        'used_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    /**
     * Terbitkan kode baru untuk sebuah unit dan kembalikan bentuk TEKS POLOSnya.
     * Teks polos hanya ada di sini — yang tersimpan cuma hash-nya.
     *
     * Kode lama unit yang sama dan belum terpakai ikut dibatalkan: hanya boleh
     * ada satu kode hidup per unit, supaya kode yang tercecer di catatan lama
     * tidak diam-diam tetap berlaku.
     *
     * @return string kode teks polos, mis. "AC34-KMNP-QRTU"
     */
    public static function issueFor(Unit $unit, int $ttlHours = self::DEFAULT_TTL_HOURS): string
    {
        static::where('unit_id', $unit->id)->whereNull('used_at')->delete();

        $plain = collect(range(1, self::LENGTH))
            ->map(fn () => self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)])
            ->join('');

        static::create([
            'unit_id' => $unit->id,
            'code_hash' => self::hash($plain),
            'expires_at' => now()->addHours($ttlHours),
        ]);

        return self::format($plain);
    }

    /**
     * Cari kode yang MASIH SAH untuk teks polos yang dimasukkan operator.
     *
     * Pencarian lewat hash, bukan membandingkan teks polos satu per satu: itu
     * membuat lookup-nya satu query berindeks sekaligus menjaga agar tabelnya
     * tidak pernah menyimpan kode yang bisa langsung dipakai.
     */
    public static function findValid(string $plain): ?self
    {
        return static::query()
            ->where('code_hash', self::hash(self::normalize($plain)))
            ->valid()
            ->first();
    }

    public function scopeValid(Builder $query): Builder
    {
        return $query->whereNull('used_at')->where('expires_at', '>', now());
    }

    public function markUsed(): void
    {
        $this->forceFill(['used_at' => now()])->save();
    }

    /** Tampilkan berkelompok supaya mudah dibaca dan disalin: XXXX-XXXX-XXXX. */
    public static function format(string $plain): string
    {
        return implode('-', str_split(self::normalize($plain), 4));
    }

    /** Terima kode dengan/tanpa tanda hubung, huruf kecil, dan spasi tercecer. */
    public static function normalize(string $plain): string
    {
        return Str::upper(preg_replace('/[^A-Za-z0-9]/', '', $plain) ?? '');
    }

    /**
     * SHA-256 tanpa salt, sengaja: kodenya acak 55 bit, bukan password pilihan
     * manusia, jadi tidak ada yang bisa ditebak dari kamus. Hash cepat justru
     * yang dibutuhkan di sini karena lookup-nya harus lewat index unik —
     * bcrypt/argon tidak bisa dipakai untuk itu.
     */
    private static function hash(string $plain): string
    {
        return hash('sha256', self::normalize($plain));
    }
}
