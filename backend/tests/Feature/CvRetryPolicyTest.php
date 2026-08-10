<?php

use App\Exceptions\CvServiceUnavailableException;
use App\Services\CvClientService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Berapa kali sebuah request BENAR-BENAR dikirim ke CV service.
 *
 * `retry()` tanpa predikat mengulang setiap respons gagal, termasuk 4xx. Itu
 * mahal di tempat yang salah: kiosk mengirim frame tiap 200 ms selama memindai,
 * jadi satu kondisi kamera yang buruk melipattigakan beban ke CV service tepat
 * saat ia paling sibuk — sekaligus menahan tiap frame ekstra 1 detik, yang
 * memperlambat loop deteksi yang sedang bermasalah.
 *
 * Semua test di sini menghitung lewat Http::assertSentCount, bukan hanya
 * memeriksa hasil akhirnya — jumlah percobaan justru inti perilakunya.
 */
beforeEach(function () {
    config(['services.cv.url' => 'http://cv-service:8000']);
    $this->cv = app(CvClientService::class);
});

it('sends an invalid-image 422 exactly once', function () {
    Http::fake(['*/classify' => Http::response(['detail' => 'bukan gambar valid'], 422)]);

    try {
        $this->cv->classify('x');
    } catch (\Throwable) {
        // Diteruskan ke pemanggil sebagai 422 — yang diuji di sini jumlah kirimnya.
    }

    Http::assertSentCount(1);
});

it('sends a 400 exactly once', function () {
    Http::fake(['*/classify' => Http::response(['detail' => 'terlalu besar'], 400)]);

    try {
        $this->cv->classify('x');
    } catch (\Throwable) {
    }

    Http::assertSentCount(1);
});

it('does not retry a rejected internal token', function () {
    // Shared secret yang salah tidak akan sembuh dalam 500 ms.
    Http::fake(['*/classify' => Http::response(['detail' => 'token tidak valid'], 401)]);

    expect(fn () => $this->cv->classify('x'))->toThrow(CvServiceUnavailableException::class);

    Http::assertSentCount(1);
});

it('retries a 500 — two attempts in total', function () {
    // Service yang sedang goyah memang layak dicoba lagi — inilah satu-satunya
    // kegagalan berbalas yang hasilnya mungkin berubah.
    //
    // DUA, bukan tiga: `retry(2)` di Laravel berarti jumlah percobaan TOTAL,
    // bukan jumlah pengulangan setelah percobaan pertama.
    Http::fake(['*/classify' => Http::response('boom', 500)]);

    expect(fn () => $this->cv->classify('x'))->toThrow(CvServiceUnavailableException::class);

    Http::assertSentCount(2);
});

it('retries a 503 as well', function () {
    Http::fake(['*/classify' => Http::response('unavailable', 503)]);

    expect(fn () => $this->cv->classify('x'))->toThrow(CvServiceUnavailableException::class);

    Http::assertSentCount(2);
});

it('retries when the service cannot be reached at all', function () {
    // Http::assertSentCount TIDAK bisa dipakai di sini: fake yang melempar
    // tidak pernah tercatat sebagai request terkirim (recorded kosong).
    // Percobaannya dihitung sendiri lewat closure.
    $percobaan = 0;

    Http::fake(function () use (&$percobaan) {
        $percobaan++;

        throw new ConnectionException('tidak tersambung');
    });

    expect(fn () => $this->cv->classify('x'))->toThrow(CvServiceUnavailableException::class);
    expect($percobaan)->toBe(2);
});

it('sends a successful request exactly once', function () {
    Http::fake(['*/classify' => Http::response([
        'category' => 'organic', 'confidence' => 0.9, 'bbox' => null, 'model_version' => 'dummy-1',
    ])]);

    expect($this->cv->classify('x')->category)->toBe('organic');

    Http::assertSentCount(1);
});

it('recovers when a flaky service succeeds on the second attempt', function () {
    // Membuktikan retry-nya tidak sekadar mati: 5xx pertama diulang, dan
    // jawaban keduanya dipakai.
    Http::fake(['*/classify' => Http::sequence()
        ->push('boom', 500)
        ->push(['category' => 'inorganic', 'confidence' => 0.8, 'bbox' => null, 'model_version' => 'dummy-1'], 200),
    ]);

    expect($this->cv->classify('x')->category)->toBe('inorganic');

    Http::assertSentCount(2);
});
