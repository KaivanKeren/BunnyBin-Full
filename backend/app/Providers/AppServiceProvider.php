<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

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

        // P2-2: Rate limit untuk endpoint CV classify — 10 req/detik per kiosk token.
        // Cukup longgar untuk scanning normal (~200ms/frame = 5 fps), tapi mencegah
        // flood dari bug frontend (infinite loop, dll).
        RateLimiter::for('cv-classify', function ($request) {
            return Limit::perMinute(600, $request->user()?->id ?? $request->ip())
                ->by($request->user()?->id ?? $request->ip());
        });
    }
}
