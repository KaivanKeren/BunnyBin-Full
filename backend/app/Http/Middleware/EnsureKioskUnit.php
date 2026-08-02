<?php

namespace App\Http\Middleware;

use App\Models\Unit;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Penjaga rute ingest kiosk. Session admin juga lolos auth:sanctum, jadi tidak
 * cukup mengandalkan itu: pemanggil wajib token unit ber-ability 'kiosk' DAN
 * kodenya harus sama dengan unit di URL — token unit A tidak boleh menulis data
 * unit B. Setelah lolos, controller cukup memakai $request->user().
 */
class EnsureKioskUnit
{
    public function handle(Request $request, Closure $next): Response
    {
        $caller = $request->user();

        abort_unless($caller instanceof Unit && $caller->tokenCan('kiosk'), 403);
        abort_unless($caller->code === $request->route('code'), 403);

        return $next($request);
    }
}
