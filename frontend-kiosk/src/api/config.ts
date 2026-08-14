// src/api/config.ts
// Satu tempat baca env kiosk. Semua VITE_* di-resolve di sini.

export const config = {
  useMock: (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false',
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  // HOST saja, tanpa path — prefix /api ditambahkan RealEsp32Client. Firmware
  // berjalan sebagai station di WiFi sekolah (bukan access point sendiri).
  // Firmware memang mendaftarkan mDNS "bunnybin.local", tapi itu hanya bekerja
  // bila mesin yang membuka kiosk menjalankan resolver mDNS — di mesin dev ini
  // avahi mati, jadi default-nya IP langsung. IP ini dibagikan DHCP dan bisa
  // berubah; cek Serial Monitor saat boot lalu set VITE_ESP32_BASE_URL.
  esp32BaseUrl: import.meta.env.VITE_ESP32_BASE_URL ?? 'bunnybin.local',
  debugPanel: import.meta.env.VITE_DEBUG_PANEL === 'true',
  // CATATAN: token kiosk dan unit_code SENGAJA TIDAK ADA DI SINI lagi.
  //
  // Keduanya dulu dibaca dari VITE_KIOSK_API_TOKEN / VITE_UNIT_CODE. Semua
  // variabel VITE_* di-inline saat build, jadi tokennya selalu berakhir sebagai
  // teks polos di dalam bundle .js yang dilayankan ke browser — terbaca siapa
  // pun yang membuka DevTools di tablet kiosk.
  //
  // Sekarang keduanya lahir saat aktivasi (POST /devices/activate) dan hidup di
  // localStorage perangkat: lihat @/api/credentials. Menambahkannya kembali ke
  // sini akan mengembalikan kebocoran yang sama.
  // Jeda relay pembacaan ESP32 → cloud. Polling layar jauh lebih cepat (2 dtk),
  // tapi menulis snapshot secepat itu hanya membanjiri tabel time-series.
  fillRelayMs: Number(import.meta.env.VITE_FILL_RELAY_MS ?? 30_000),

  // --- Kamera ---
  //
  // Kiosk memindai sampah dengan KAMERA HP, bukan kamera bawaan laptop. Ada dua
  // jalur yang didukung dan keduanya butuh setelan berbeda (lihat src/camera/):
  //
  //   device — client DroidCam di host (scripts/setup-droidcam.sh) menaruh feed
  //            HP sebagai kamera virtual; kiosk memilihnya lewat cocok-label.
  //   mjpeg  — kiosk membaca langsung stream HTTP dari app di HP, diteruskan
  //            proxy same-origin milik kiosk.
  //   auto   — coba device dulu, jatuh ke mjpeg bila kamera virtual tak ada.
  camera: {
    source: (import.meta.env.VITE_CAMERA_SOURCE ?? 'auto') as 'auto' | 'device' | 'mjpeg',

    // Pola label kamera virtual, dipisah koma, urut prioritas. Kosongkan
    // (VITE_CAMERA_DEVICE_MATCH=) untuk memakai kamera default host apa adanya.
    deviceMatch: import.meta.env.VITE_CAMERA_DEVICE_MATCH,

    // Boleh diam-diam memakai kamera bawaan bila kamera HP tak ditemukan?
    // Default true supaya pengembangan tidak buntu — tapi kiosk memasang badge
    // peringatan di layar pindai setiap kali jalur ini terpakai, karena kamera
    // bawaan hampir selalu menghadap ke arah yang salah.
    allowBuiltinFallback: import.meta.env.VITE_CAMERA_ALLOW_BUILTIN_FALLBACK !== 'false',

    // Alamat app kamera di HP. TIDAK dibaca browser — dipakai proxy dev-server
    // Vite (vite.config.ts) sebagai target. Di produksi, target yang sama
    // diletakkan di nginx.conf.
    streamUrl: import.meta.env.VITE_CAMERA_STREAM_URL ?? 'http://10.23.3.187:4747',

    // Path feed DI HP, bukan yang dibuka browser — kiosk selalu memintanya
    // lewat CAMERA_PROXY_PATH (src/camera/proxy.ts) agar tetap same-origin.
    // Bawaan DroidCam: /mjpegfeed (bisa diberi resolusi, mis. ?640x480).
    // IP Webcam Android: /video.
    streamPath: import.meta.env.VITE_CAMERA_STREAM_PATH ?? '/mjpegfeed?640x480',

    // Batas tunggu frame PERTAMA. Kamera virtual yang tidak punya produsen
    // (device ada, droidcam-cli mati) membuka stream tanpa pernah mengirim
    // gambar — tenggat inilah yang mengubahnya jadi pesan error.
    readyTimeoutMs: Number(import.meta.env.VITE_CAMERA_READY_TIMEOUT_MS ?? 8000),
  },
} as const
