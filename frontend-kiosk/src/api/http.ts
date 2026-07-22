// src/api/http.ts
// HTTP client cloud (Laravel). Kiosk autentikasi pakai Sanctum TOKEN per-unit ability 'kiosk'
// (§6) — backend sudah dibangun begini (Unit HasApiTokens, route auth:sanctum). Bukan cookie session.
import axios from 'axios'
import { config } from './config'
import { toCloudError } from './errors'

export const api = axios.create({
  baseURL: config.apiUrl,
  headers: {
    Accept: 'application/json',
    ...(config.kioskToken ? { Authorization: `Bearer ${config.kioskToken}` } : {}),
  },
})

// Satu tempat memisahkan "gagal jaringan" (ulangi) dari "ditolak server"
// (buang). Tanpa ini, satu payload cacat menyumbat retry queue selamanya.
api.interceptors.response.use(
  (res) => res,
  (err) => Promise.reject(toCloudError(err)),
)

// ESP32 lokal — instance terpisah, tanpa credential cloud.
export const esp32 = axios.create({
  baseURL: config.esp32BaseUrl,
  headers: { Accept: 'application/json' },
  timeout: 4000,
})
