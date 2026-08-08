<?php

namespace App\Services;

use App\Exceptions\CvServiceUnavailableException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class CvClientService
{
    public function classify(string $imageBase64): CvResult
    {
        try {
            $response = Http::timeout(10)
                ->retry(2, 500, throw: false)
                // CV service menolak /classify tanpa header ini (401). Nilainya
                // harus sama dengan CV_INTERNAL_TOKEN di sisi FastAPI.
                ->withHeaders(['X-Internal-Token' => config('services.cv.internal_token')])
                ->post(config('services.cv.url').'/classify', [
                    'image_base64' => $imageBase64,
                ]);
        } catch (ConnectionException) {
            throw new CvServiceUnavailableException;
        }

        // 422/400 dari CV service = kesalahan input, teruskan ke pemanggil;
        // 5xx / tidak tersambung = service down.
        if ($response->serverError()) {
            throw new CvServiceUnavailableException;
        }

        // 401/403 = shared secret kita sendiri salah/kosong. Itu SALAH KONFIGURASI
        // SERVER, bukan kesalahan pemanggil: token kiosk yang mengirim gambar
        // sepenuhnya sah. Meneruskannya apa adanya akan menyalahkan kiosk atas
        // kesalahan backend — dan lebih buruk, 401 masuk RETRYABLE_STATUSES di
        // kiosk (api/errors.ts), sehingga kegagalan konfigurasi permanen terbaca
        // sebagai gangguan sementara. Perlakukan sama dengan service mati: 503.
        if (in_array($response->status(), [401, 403], true)) {
            throw new CvServiceUnavailableException;
        }

        if ($response->clientError()) {
            abort($response->status(), $this->errorMessage($response->json('detail')));
        }

        return CvResult::fromArray($response->json());
    }

    /**
     * FastAPI memakai dua BENTUK berbeda untuk `detail`, dan abort() hanya
     * menerima string:
     *
     *   HTTPException kita sendiri → string  ("image_base64 bukan base64 valid")
     *   Error validasi pydantic    → array   ([{"type":"string_too_short", ...}])
     *
     * Melempar array ke abort() menghasilkan TypeError, jadi setiap error
     * validasi dari CV service berubah menjadi HTTP 500 di sisi kita — persis
     * kebalikan dari maksudnya, karena 422 yang informatif tertutup oleh 500
     * yang tidak menjelaskan apa pun.
     *
     * @param  mixed  $detail
     */
    private function errorMessage($detail): string
    {
        if (is_string($detail)) {
            return $detail;
        }

        if (is_array($detail)) {
            $messages = array_filter(array_map(
                fn ($item) => is_array($item) ? ($item['msg'] ?? null) : (is_string($item) ? $item : null),
                $detail,
            ));

            if ($messages !== []) {
                return implode('; ', $messages);
            }
        }

        return 'Gambar tidak valid.';
    }
}
