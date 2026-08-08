// src/api/http.ts
// HTTP client cloud (Laravel). Kiosk autentikasi pakai Sanctum TOKEN per-unit ability 'kiosk'
// (§6) — backend sudah dibangun begini (Unit HasApiTokens, route auth:sanctum). Bukan cookie session.
import axios from 'axios'
import { config } from './config'
import { readCredentials } from './credentials'
import { toCloudError } from './errors'

export const api = axios.create({
  baseURL: config.apiUrl,
  headers: { Accept: 'application/json' },
})

// Token dibaca PER REQUEST, bukan sekali saat modul dimuat.
//
// Dulu header Authorization dipasang saat instance axios dibuat, memakai nilai
// dari import.meta.env — yang berarti tokennya ter-inline ke bundle dan tidak
// bisa berubah tanpa rebuild. Sekarang token lahir saat aktivasi dan hidup di
// localStorage, jadi ia harus dibaca setiap kali: request pertama setelah layar
// aktivasi terjadi tanpa reload halaman.
api.interceptors.request.use((request) => {
  const credentials = readCredentials()

  if (credentials) {
    request.headers.Authorization = `Bearer ${credentials.token}`
  }

  return request
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
