<?php

namespace App\Providers;

use Illuminate\Http\Resources\Json\JsonResource;
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
    }
}
