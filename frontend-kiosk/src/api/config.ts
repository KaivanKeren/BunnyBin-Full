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
  // Sanctum token per-unit ability 'kiosk' (§6) — di-generate backend `php artisan unit:token {code}`.
  kioskToken: import.meta.env.VITE_KIOSK_API_TOKEN ?? '',
  // unit_code device ini — harus SAMA dengan unit yang dipakai token kiosk,
  // dan dengan unit yang tampil di dashboard admin. Prototype: satu unit BNB-001.
  unitCode: import.meta.env.VITE_UNIT_CODE ?? 'BNB-001',
  // Jeda relay pembacaan ESP32 → cloud. Polling layar jauh lebih cepat (2 dtk),
  // tapi menulis snapshot secepat itu hanya membanjiri tabel time-series.
  fillRelayMs: Number(import.meta.env.VITE_FILL_RELAY_MS ?? 30_000),
} as const
