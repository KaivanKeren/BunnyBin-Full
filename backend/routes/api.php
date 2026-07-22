<?php

use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CvProxyController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\KioskIngestController;
use App\Http\Controllers\Api\QuizItemController;
use App\Http\Controllers\Api\SchoolController;
use App\Http\Controllers\Api\SortLogController;
use App\Http\Controllers\Api\UnitController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);

// Dipanggil kiosk/device dengan token unit (ability kiosk), bukan session admin.
Route::post('/cv/classify', [CvProxyController::class, 'classify'])->middleware('auth:sanctum');

// Ingest kiosk lewat HTTP — jalur setara MQTT untuk device tanpa broker.
// kiosk.unit memastikan {code} adalah unit pemilik token yang dipakai.
Route::middleware(['auth:sanctum', 'kiosk.unit'])->prefix('units/{code}')->group(function () {
    Route::post('/fill', [KioskIngestController::class, 'fill']);
    Route::post('/sort-logs', [KioskIngestController::class, 'sortLog']);
    Route::post('/heartbeat', [KioskIngestController::class, 'heartbeat']);
});

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);

    // Read — semua role, di-scope ke sekolah admin login (kecuali super_admin)
    Route::get('/units', [UnitController::class, 'index']);
    Route::get('/units/{unit}', [UnitController::class, 'show'])->whereNumber('unit');
    Route::get('/units/{unit}/fill-history', [UnitController::class, 'fillHistory'])->whereNumber('unit');
    Route::get('/units/{unit}/sort-logs', [UnitController::class, 'sortLogs'])->whereNumber('unit');
    Route::get('/sort-logs', [SortLogController::class, 'index']);
    Route::get('/quiz-items', [QuizItemController::class, 'index']);
    Route::get('/alerts', [AlertController::class, 'index']);
    Route::patch('/alerts/{alert}/read', [AlertController::class, 'markRead'])->whereNumber('alert');

    Route::middleware('role:super_admin')->group(function () {
        Route::apiResource('schools', SchoolController::class);
        Route::post('/units', [UnitController::class, 'store']);
        Route::match(['put', 'patch'], '/units/{unit}', [UnitController::class, 'update'])->whereNumber('unit');
        Route::delete('/units/{unit}', [UnitController::class, 'destroy'])->whereNumber('unit');
        Route::apiResource('quiz-items', QuizItemController::class)->only(['store', 'update', 'destroy']);
    });
});
