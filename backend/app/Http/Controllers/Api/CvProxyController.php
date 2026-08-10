<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Unit;
use App\Services\CvClientService;
use App\Services\DeviceIngestService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Proxy klasifikasi CV. Satu tanggung jawab: gambar masuk, kategori keluar.
 *
 * Endpoint ini DULU juga menulis ke sort_logs bila `unit_code` + `quiz_item_id`
 * disertakan. Blok itu dihapus, bukan dirutekan ulang ke DeviceIngestService —
 * tiga alasan, dan yang ketiga yang menentukan:
 *
 *   1. Tidak ada klien yang memakainya. RealCloudClient hanya mengirim
 *      image_base64; jalur itu tidak pernah aktif sekali pun.
 *
 *   2. Semantiknya sudah salah sejak alur sortir diperbaiki. Ia mencatat
 *      is_correct dengan membandingkan hasil CV dengan kategori quiz item —
 *      yaitu "apakah CV setuju dengan soalnya", diukur SEBELUM anak menjawab
 *      apa pun. Aturan penilaian yang sebenarnya adalah jawaban anak vs hasil
 *      deteksi, dan itu dicatat lewat POST /units/{code}/sort-logs setelah anak
 *      menekan tombol. Membiarkan keduanya hidup berarti dua baris untuk satu
 *      sortiran, salah satunya mengukur hal yang tidak ada gunanya.
 *
 *   3. Endpoint ini dipanggil 5 KALI PER DETIK selama pemindaian (loop deteksi
 *      real-time, DETECT_INTERVAL_MS = 200). Klien yang menyertakan kedua
 *      parameter itu — persis seperti yang "didukung" — akan menulis lima baris
 *      sort_logs per detik ke hypertable, diam-diam, sepanjang anak memegang
 *      sampahnya di depan kamera.
 *
 * Menulis sort log tetap punya SATU rumah: DeviceIngestService, lewat
 * /units/{code}/sort-logs.
 */
class CvProxyController extends Controller
{
    /**
     * POST /api/cv/classify — dipanggil kiosk/device, BUKAN admin dashboard.
     * Body: multipart `image` ATAU {image_base64}.
     *
     * Endpoint ini HANYA mengklasifikasi. Ia tidak menulis apa pun ke sort_logs,
     * dan itu keputusan yang disengaja — lihat catatan di bawah.
     */
    public function classify(Request $request, CvClientService $cv, DeviceIngestService $ingest): JsonResponse
    {
        // Sanctum session admin juga lolos auth:sanctum — pastikan pemanggil
        // adalah token unit dengan ability kiosk.
        $caller = $request->user();
        abort_unless($caller instanceof Unit && $caller->tokenCan('kiosk'), 403);

        // P0-2: Tanda unit hidup setiap kali hit /classify
        $ingest->markSeen($caller);

        $validated = $request->validate([
            'image' => ['required_without:image_base64', 'file', 'image', 'max:5120'],
            'image_base64' => ['required_without:image', 'string'],
            'unit_code' => ['sometimes', 'required', 'exists:units,code'],
        ]);

        // Validasi ownership — unit_code harus milik token yang autentik.
        // Dipertahankan meski tak lagi dipakai untuk menulis: klien yang masih
        // mengirimnya harus tetap ditolak bila kodenya bukan miliknya.
        if (isset($validated['unit_code']) && $validated['unit_code'] !== $caller->code) {
            abort(403, 'unit_code tidak sesuai dengan token yang digunakan');
        }

        $imageBase64 = $request->hasFile('image')
            ? base64_encode($request->file('image')->getContent())
            : $validated['image_base64'];

        return response()->json($cv->classify($imageBase64)->toArray());
    }
}
