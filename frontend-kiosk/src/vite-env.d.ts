/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCK?: string
  readonly VITE_API_URL?: string
  readonly VITE_ESP32_BASE_URL?: string
  readonly VITE_DEBUG_PANEL?: string
  readonly VITE_KIOSK_API_TOKEN?: string
  readonly VITE_UNIT_CODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
