<?php

use App\Services\AlertEngineService;
use Illuminate\Support\Facades\Schedule;

Schedule::call(fn () => app(AlertEngineService::class)->sweepOffline())
    ->everyFiveMinutes()
    ->name('sweep-offline-units');
