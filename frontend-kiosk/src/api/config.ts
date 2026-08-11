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
} as const
