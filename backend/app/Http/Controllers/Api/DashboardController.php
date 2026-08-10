<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminUser;
use App\Models\Alert;
use App\Models\SortLog;
use App\Models\Unit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class DashboardController extends Controller
{
    /**
     * Kunci cache ringkasan dashboard.
     *
     * Publik dan statis supaya UnitController bisa membatalkannya saat unit
     * berubah. Tanpa itu, unit yang baru dibuat/dihapus baru muncul setelah
     * cache 30 detik kedaluwarsa — dan karena frontend juga polling tiap 30
     * detik, jendela terburuknya 60 detik. Bukan bencana, tapi cukup membuat
     * admin mengira penyimpanannya gagal lalu menekan tombolnya lagi.
     */
    public static function cacheKeyFor(AdminUser $user): string
    {
        return 'dashboard.summary.'.($user->isSuperAdmin() ? 'all' : "school-{$user->school_id}");
    }

    /**
     * Ringkasan menghitung SELURUH unit yang terlihat pengguna, jadi perubahan
     * satu unit membatalkan cache setiap peran yang mungkin melihatnya:
     * super admin (semua) dan admin sekolah pemiliknya.
     */
    public static function forgetCacheFor(?int $schoolId): void
    {
        Cache::forget('dashboard.summary.all');

        if ($schoolId !== null) {
            Cache::forget("dashboard.summary.school-{$schoolId}");
        }
    }

    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();

        $cacheKey = self::cacheKeyFor($user);

        return response()->json(Cache::remember($cacheKey, 30, function () use ($user) {
            $units = Unit::forUser($user)->withLatestFill()->get();
            $unitIds = $units->pluck('id');

            $withFill = $units->whereNotNull('latest_recorded_at');

            $recentLogs = SortLog::whereIn('unit_id', $unitIds)
                ->where('created_at', '>', now()->subDays(7))
                ->whereNotNull('is_correct');
            $totalLogs = (clone $recentLogs)->count();

            return [
                'total_units' => $units->count(),
                'units_online' => $units->where('status', '!=', Unit::STATUS_OFFLINE)->count(),
                'units_offline' => $units->where('status', Unit::STATUS_OFFLINE)->count(),
                'avg_organic_pct' => $withFill->isEmpty()
                    ? null
                    : (int) round($withFill->avg('latest_organic_pct')),
                'avg_inorganic_pct' => $withFill->isEmpty()
                    ? null
                    : (int) round($withFill->avg('latest_inorganic_pct')),
                'unread_alerts' => Alert::whereIn('unit_id', $unitIds)->where('is_read', false)->count(),
                // Persentase 0-100, null bila belum ada log ternilai 7 hari terakhir.
                'sort_accuracy_7d' => $totalLogs === 0
                    ? null
                    : round((clone $recentLogs)->where('is_correct', true)->count() / $totalLogs * 100, 1),
            ];
        }));
    }
}
