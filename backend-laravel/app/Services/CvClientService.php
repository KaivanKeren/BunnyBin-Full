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

        if ($response->clientError()) {
            abort($response->status(), $response->json('detail') ?? 'Gambar tidak valid.');
        }

        return CvResult::fromArray($response->json());
    }
}
