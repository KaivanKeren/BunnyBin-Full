<?php

namespace App\Providers;

use App\Models\Unit;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Kontrak API §6 master PRD memakai objek flat, tanpa wrapper "data"
        // (koleksi paginated tetap punya data/links/meta).
        JsonResource::withoutWrapping();

        // P2-2: Rate limit untuk endpoint CV classify — 1 req/detik per kiosk token.
        //
        // Dulu 600/menit karena kiosk memindai 5 fps dengan inferensi lokal yang
        // praktis gratis. Sejak CV_MODE=vlm, tiap panggilan adalah permintaan
        // berbayar ke model cloud dan jeda kiosk naik ke 2 detik, jadi peran
        // limiter ini berubah: dari penjaga CPU menjadi PENJAGA TAGIHAN. Bug loop
        // di frontend sekarang berbiaya uang, bukan sekadar beban prosesor.
        //
        // 60/menit tetap ~30x di atas pemakaian normal (1 sortiran = 1-5 panggilan),
        // dan tetap di bawah baseline 1200/menit milik token unit di
        // configureApiRateLimiter() — syarat agar limiter inilah yang mengikat.
        RateLimiter::for('cv-classify', function ($request) {
            return Limit::perMinute(60, $request->user()?->id ?? $request->ip())
                ->by($request->user()?->id ?? $request->ip());
        });

        $this->configureApiRateLimiter();
        $this->configureLoginRateLimiter();
    }

    /**
     * Baseline seluruh /api, dipasang lewat $middleware->throttleApi() di
     * bootstrap/app.php. Laravel 11+ TIDAK memasang throttle apa pun secara
     * otomatis, dan throttleApi() melempar MissingRateLimiterException bila
     * limiter bernama 'api' tidak ada — jadi definisi ini wajib, bukan opsional.
     *
     * ATURAN URUTAN yang gampang terlanggar: batas di sini harus lebih LONGGAR
     * daripada limiter per-rute mana pun, karena keduanya berlaku bersamaan dan
     * yang paling ketat yang menang. Kiosk memanggil /cv/classify saat memindai
     * (throttle:cv-classify = 60/menit); menyamakan baseline ini dengan angka
     * admin akan mematikan pemindaian DAN membuat limiter cv-classify jadi
     * konfigurasi mati yang tak pernah tercapai. Karena itu batasnya dibedakan
     * per jenis pemanggil.
     */
    private function configureApiRateLimiter(): void
    {
        RateLimiter::for('api', function (Request $request) {
            $caller = $request->user();

            // Token unit kiosk: harus di atas 60/menit milik cv-classify supaya
            // limiter spesifik itu yang mengikat, bukan baseline ini. Angkanya
            // sengaja dibiarkan 1200: kiosk juga mengirim fill, sort-logs, dan
            // heartbeat lewat baseline yang sama.
            if ($caller instanceof Unit) {
                return Limit::perMinute(1200)->by('unit:'.$caller->id);
            }

            // Admin dashboard: polling 30 detik atas beberapa query sekaligus,
            // 120/menit memberi kelonggaran besar untuk pemakaian normal.
            if ($caller !== null) {
                return Limit::perMinute(120)->by('admin:'.$caller->id);
            }

            // Anonim — praktis hanya /auth/login, yang punya batas jauh lebih
            // ketat sendiri di limiter 'login'.
            return Limit::perMinute(30)->by($request->ip());
        });
    }

    /**
     * Pertahanan brute force untuk /auth/login. Dua batas berlapis karena
     * masing-masing menutup serangan yang berbeda:
     *
     *   per-IP    — satu penyerang menyisir BANYAK akun dari satu tempat.
     *   per-email — banyak IP (botnet/proxy) menyerang SATU akun; batas per-IP
     *               sama sekali tidak melihat pola ini.
     *
     * Batas per-email sengaja lebih longgar dari per-IP: kalau disamakan, siapa
     * pun bisa mengunci admin sungguhan dari akunnya cukup dengan membakar kuota
     * memakai email orang itu. 20/menit masih membatasi penyerang ke ~29 ribu
     * percobaan/hari — tak berarti melawan bcrypt cost 12 — sementara admin yang
     * salah ketik password beberapa kali tidak pernah menyentuhnya.
     */
    private function configureLoginRateLimiter(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return [
                Limit::perMinute(5)->by('login-ip:'.$request->ip()),
                Limit::perMinute(20)->by('login-email:'.$email),
            ];
        });
    }
}
