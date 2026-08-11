<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UnitActivationCode;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * POST /api/devices/activate — kiosk menukar kode aktivasi sekali pakai dengan
 * token Sanctum-nya sendiri.
 *
 * Ini satu-satunya rute yang menerbitkan token tanpa autentikasi sebelumnya,
 * jadi bentuknya sengaja sesempit mungkin: kode sekali pakai, berumur pendek,
 * disimpan sebagai hash, dan rutenya di-throttle ketat (routes/api.php).
 *
 * Tujuannya menghapus alasan terakhir menaruh token di dalam bundle: selama
 * token datang dari VITE_KIOSK_API_TOKEN, ia terbaca siapa pun yang membuka
 * DevTools di tablet kiosk. Setelah aktivasi, token hidup di localStorage
 * perangkat itu saja dan tidak pernah ikut ter-build.
 */
class DeviceActivationController extends Controller
{
    public function activate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:32'],
        ]);

        // Transaksi + lockForUpdate: dua kiosk yang mengirim kode sama pada saat
        // bersamaan tidak boleh sama-sama mendapat token. Tanpa penguncian,
        // "sekali pakai" hanya berlaku selama tidak ada yang mencoba balapan.
        $result = DB::transaction(function () use ($validated) {
            $activation = UnitActivationCode::findValid($validated['code']);

            if ($activation === null) {
                return null;
            }

            $activation = UnitActivationCode::query()
                ->whereKey($activation->getKey())
                ->valid()
                ->lockForUpdate()
                ->first();

            if ($activation === null) {
                return null;
            }

            $activation->markUsed();

            $unit = $activation->unit;

            // Satu token aktif per device — sama seperti perintah unit:token.
            // Mengaktifkan ulang perangkat otomatis mencabut token lamanya,
            // sehingga tablet yang hilang tidak tetap bisa menulis data.
            $unit->tokens()->where('name', 'kiosk')->delete();

            return [
                'unit' => $unit,
                'token' => $unit->createToken('kiosk', ['kiosk'])->plainTextToken,
            ];
        });

        if ($result === null) {
            Log::warning('Aktivasi device ditolak: kode tidak sah/kedaluwarsa/terpakai', [
                'ip' => $request->ip(),
            ]);

            // Pesan sengaja tidak membedakan "tidak ada", "kedaluwarsa", dan
            // "sudah dipakai" — perbedaan itu memberi tahu penebak bahwa kodenya
            // pernah benar.
            return response()->json([
                'error' => 'activation_failed',
                'message' => 'Kode aktivasi tidak berlaku. Minta kode baru ke admin.',
            ], 422);
        }

        return response()->json([
            'token' => $result['token'],
            'unit_code' => $result['unit']->code,
            'unit_id' => $result['unit']->id,
            'location_label' => $result['unit']->location_label,
        ], 201);
    }
}
