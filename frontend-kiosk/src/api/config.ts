// src/api/config.ts
// Satu tempat baca env kiosk. Semua VITE_* di-resolve di sini.

export const config = {
  useMock: (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false',
  apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  esp32BaseUrl: import.meta.env.VITE_ESP32_BASE_URL ?? 'http://192.168.4.1',
  debugPanel: import.meta.env.VITE_DEBUG_PANEL === 'true',
  // Sanctum token per-unit ability 'kiosk' (§6) — di-generate backend `php artisan unit:token {code}`.
  kioskToken: import.meta.env.VITE_KIOSK_API_TOKEN ?? '',
  // unit_code device ini — dipakai RealCloudClient untuk /api/units/{code}/sort-logs
  unitCode: import.meta.env.VITE_UNIT_CODE ?? 'DEV-UNIT',
} as const
