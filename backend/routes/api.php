<?php

use App\Http\Controllers\Api\AlertController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CvProxyController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeviceActivationController;
use App\Http\Controllers\Api\KioskIngestController;
use App\Http\Controllers\Api\QuizItemController;
use App\Http\Controllers\Api\SchoolController;
use App\Http\Controllers\Api\SortLogController;
use App\Http\Controllers\Api\UnitController;
use Illuminate\Support\Facades\Route;

// throttle:login = 5 percobaan/menit per IP + 20/menit per email (lihat
// AppServiceProvider). Tanpa ini, bcrypt cost 12 memang memperlambat penebakan
// password — tapi justru itu yang membuat login tak terbatas jadi vektor DoS:
// beberapa ratus request paralel sudah cukup menghabiskan CPU server.
Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:login');

// Dipanggil kiosk/device dengan token unit (ability kiosk), bukan session admin.
// P2-2: throttle 'cv-classify' = 10 req/detik per kiosk token (600/menit).
Route::post('/cv/classify', [CvProxyController::class, 'classify'])
    ->middleware(['auth:sanctum', 'throttle:cv-classify']);

// Kiosk menukar kode aktivasi sekali pakai dengan token unitnya sendiri, supaya
// token tidak perlu ikut ter-build ke dalam bundle JavaScript yang publik.
//
// Ini SATU-SATUNYA rute yang menerbitkan token tanpa autentikasi sebelumnya,
// jadi throttle-nya jauh lebih ketat dari baseline: kodenya 55 bit dan berumur
// 24 jam, tapi 10 percobaan/menit membuat penebakan tidak masuk akal sekaligus
// tetap longgar untuk operator yang salah ketik beberapa kali.
Route::post('/devices/activate', [DeviceActivationController::class, 'activate'])
    ->middleware('throttle:10,1');

// Ingest kiosk lewat HTTP — jalur setara MQTT untuk device tanpa broker.
// kiosk.unit memastikan {code} adalah unit pemilik token yang dipakai.
Route::middleware(['auth:sanctum', 'kiosk.unit'])->prefix('units/{code}')->group(function () {
    Route::post('/fill', [KioskIngestController::class, 'fill']);
    Route::post('/sort-logs', [KioskIngestController::class, 'sortLog']);
    Route::post('/heartbeat', [KioskIngestController::class, 'heartbeat']);
});

Route::middleware('auth:sanctum')->group(function () {
    // SATU-SATUNYA rute terautentikasi yang sengaja terbuka untuk dua jenis
    // pemanggil: dashboard admin DAN token unit kiosk, yang memuat seluruh bank
    // kuis aktif saat boot (RealCloudClient::getQuizBank). Bank kuis adalah
    // konten ajar global — tidak ada data sekolah lain yang bocor lewat sini.
    Route::get('/quiz-items', [QuizItemController::class, 'index']);

    // Sisanya khusus AdminUser. Tanpa 'admin', token kiosk lolos auth:sanctum
    // sampai ke controller dan berhenti di TypeError (HTTP 500) — batas
    // otorisasi yang ditegakkan kebetulan oleh type hint, bukan dengan sengaja.
    Route::middleware('admin')->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/auth/me', [AuthController::class, 'me']);

        Route::get('/dashboard/summary', [DashboardController::class, 'summary']);

        // Read — semua role, di-scope ke sekolah admin login (kecuali super_admin)
        Route::get('/units', [UnitController::class, 'index']);
        Route::get('/units/{unit}', [UnitController::class, 'show'])->whereNumber('unit');
        Route::get('/units/{unit}/fill-history', [UnitController::class, 'fillHistory'])->whereNumber('unit');
        Route::get('/units/{unit}/sort-logs', [UnitController::class, 'sortLogs'])->whereNumber('unit');
        Route::get('/sort-logs', [SortLogController::class, 'index']);
        Route::get('/alerts', [AlertController::class, 'index']);
        Route::patch('/alerts/{alert}/read', [AlertController::class, 'markRead'])->whereNumber('alert');

        // 'admin' sudah menjamin pemanggilnya AdminUser, jadi EnsureRole di sini
        // cukup memeriksa perannya saja.
        Route::middleware('role:super_admin')->group(function () {
            Route::apiResource('schools', SchoolController::class);
            Route::post('/units', [UnitController::class, 'store']);
            Route::match(['put', 'patch'], '/units/{unit}', [UnitController::class, 'update'])->whereNumber('unit');
            Route::delete('/units/{unit}', [UnitController::class, 'destroy'])->whereNumber('unit');
            Route::apiResource('quiz-items', QuizItemController::class)->only(['store', 'update', 'destroy']);
        });
    });
});
