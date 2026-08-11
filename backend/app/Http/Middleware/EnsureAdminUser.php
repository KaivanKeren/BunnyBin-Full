<?php

namespace App\Http\Middleware;

use App\Models\AdminUser;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Pasangan dari EnsureKioskUnit, untuk arah sebaliknya.
 *
 * Unit memakai HasApiTokens dan mengimplementasi Authenticatable, jadi token
 * kiosk LOLOS auth:sanctum persis seperti sesi admin. Tanpa penjaga ini,
 * satu-satunya yang menahan kiosk dari data lintas sekolah adalah type hint PHP:
 * scopeForUser(Builder, AdminUser) melempar TypeError saat menerima Unit, dan
 * TypeError itu muncul sebagai HTTP 500.
 *
 * Bersandar pada itu rapuh karena dua alasan:
 *
 *   1. Endpoint baru yang tidak kebetulan memakai type hint AdminUser akan
 *      MEMBOCORKAN data, bukan crash — dan tidak ada test yang menangkapnya.
 *   2. Sudah terlihat sekarang: /auth/me membalas 200 untuk sebuah Unit karena
 *      AuthController::profile() tidak pernah memeriksa jenis pemanggil.
 *
 * Middleware ini menjadikan batasnya eksplisit: 403 yang disengaja, bukan 500
 * yang kebetulan.
 */
class EnsureAdminUser
{
    public function handle(Request $request, Closure $next): Response
    {
        abort_unless($request->user() instanceof AdminUser, 403);

        return $next($request);
    }
}
