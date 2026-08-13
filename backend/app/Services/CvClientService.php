<?php

namespace App\Services;

use App\Exceptions\CvServiceUnavailableException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;

class CvClientService
{
    public function classify(string $imageBase64): CvResult
    {
        try {
            // 30 dtk, bukan 10: di CV_MODE=vlm satu klasifikasi adalah panggilan
            // jaringan ke model cloud, bukan inferensi lokal milidetik. Lapisannya
            // harus mengecil ke dalam — httpx 12 dtk di CV service < 30 dtk di sini
            // < klien axios kiosk yang tak berbatas — supaya jaringan lambat
            // berakhir di model lokal cadangan, bukan diputus dari luar sebelum
            // cadangan itu sempat dicoba.
            $response = Http::timeout(30)
                ->retry(2, 500, when: $this->worthRetrying(...), throw: false)
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
     * Hanya kegagalan yang MUNGKIN berubah hasilnya bila diulang.
     *
     * Sebelumnya `retry()` dipanggil tanpa predikat, dan default-nya mengulang
     * SEMUA respons gagal — termasuk 4xx. Gambar yang tidak valid dikirim DUA
     * kali dengan jeda 500 ms sebelum menyerah, padahal kode di bawahnya sudah
     * tahu 4xx itu permanen dan meneruskannya ke pemanggil. (`retry(2)` di
     * Laravel berarti jumlah percobaan TOTAL, bukan pengulangan setelah
     * percobaan pertama — diverifikasi lewat Http::assertSentCount.)
     *
     * Biayanya nyata: kiosk mengirim frame tiap 200 ms selama memindai, jadi
     * satu kondisi kamera yang buruk MELIPATGANDAKAN beban ke CV service tepat
     * saat ia sedang paling sibuk — dan menahan tiap frame ekstra 500 ms,
     * yang justru memperlambat loop deteksi yang sedang bermasalah.
     *
     * 401/403 juga tidak diulang: itu shared secret yang salah, kondisi
     * konfigurasi yang tidak akan sembuh dalam 500 ms.
     */
    private function worthRetrying(\Throwable $exception): bool
    {
        // Tidak tersambung / timeout — belum ada jawaban sama sekali.
        if ($exception instanceof ConnectionException) {
            return true;
        }

        // Ada jawaban: hanya 5xx yang layak diulang.
        return $exception instanceof RequestException
            && $exception->response->serverError();
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
