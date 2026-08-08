<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();

        // Laravel 11+ tidak lagi memasang throttle:api secara otomatis — tanpa
        // baris ini SELURUH API berjalan tanpa batas laju, termasuk /auth/login.
        // Definisi limiter 'api' ada di AppServiceProvider (wajib: throttleApi()
        // melempar MissingRateLimiterException bila limiternya tidak terdaftar).
        $middleware->throttleApi();

        $middleware->alias([
            'admin' => \App\Http\Middleware\EnsureAdminUser::class,
            'role' => \App\Http\Middleware\EnsureRole::class,
            'kiosk.unit' => \App\Http\Middleware\EnsureKioskUnit::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(fn (\App\Exceptions\CvServiceUnavailableException $e) => response()->json(
            ['error' => 'cv_unavailable'],
            503,
        ));
    })->create();
