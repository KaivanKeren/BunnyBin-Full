/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
  readonly VITE_API_URL?: string
  readonly VITE_ESP32_BASE_URL?: string
  readonly VITE_DEBUG_PANEL?: string
  readonly VITE_FILL_RELAY_MS?: string
  // Kamera HP — lihat src/api/config.ts dan src/camera/
  readonly VITE_CAMERA_SOURCE?: string
  readonly VITE_CAMERA_DEVICE_MATCH?: string
  readonly VITE_CAMERA_ALLOW_BUILTIN_FALLBACK?: string
  readonly VITE_CAMERA_STREAM_URL?: string
  readonly VITE_CAMERA_STREAM_PATH?: string
  readonly VITE_CAMERA_READY_TIMEOUT_MS?: string
  // VITE_KIOSK_API_TOKEN dan VITE_UNIT_CODE SENGAJA DIHAPUS: variabel VITE_*
  // di-inline ke bundle, jadi token yang lewat sini selalu terbaca publik.
  // Kredensial kini lahir saat aktivasi dan disimpan di localStorage —
  // lihat @/api/credentials. Jangan didaftarkan ulang di sini.
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
