// src/lib/logger.ts
// Satu gerbang untuk seluruh logging kiosk.
//
// Loop deteksi berjalan 5 kali per detik dan sebelumnya mencatat SETIAP frame —
// panjang gambar yang dikirim, hasil klasifikasi, hitungan stabil, FPS. Di
// tablet kiosk yang menyala berhari-hari itu bukan sekadar berisik: buffer
// console browser tumbuh terus dan setiap panggilan menahan objek deteksi dari
// garbage collector.
//
// Dua tingkat, dengan aturan yang berbeda tegas:
//
//   debug — jejak alur. SENYAP di produksi. Boleh sesering apa pun.
//   warn/error — kondisi yang perlu ditindak seseorang. SELALU tampil.
//
// Membedakan keduanya penting: kalau semuanya ikut dimatikan, kegagalan nyata
// (payload ditolak server, storage penuh) jadi tak terlihat sama sekali —
// persis mode kegagalan yang dicatat api/errors.ts sebagai pelajaran mahal.
import { config } from '@/api/config'

/**
 * Saklar darurat di lapangan. `VITE_DEBUG_PANEL` ditetapkan saat BUILD, jadi
 * menyalakan log di kiosk yang sudah ter-deploy akan menuntut build ulang —
 * tepat ketika seorang teknisi sedang berdiri di depan alat yang bermasalah.
 * Flag localStorage ini memberi jalan keluarnya:
 *
 *   localStorage.setItem('binexa.kiosk.debug', '1')  // lalu reload
 */
const DEBUG_KEY = 'binexa.kiosk.debug'

function debugEnabled(): boolean {
  if (config.debugPanel) return true

  try {
    return globalThis.localStorage?.getItem(DEBUG_KEY) === '1'
  } catch {
    // Akses localStorage bisa melempar (mode privat / kebijakan perangkat).
    return false
  }
}

// Dibaca SEKALI saat modul dimuat, bukan tiap panggilan: ini dievaluasi 5x per
// detik di loop deteksi, dan localStorage adalah API sinkron yang menyentuh disk.
const enabled = debugEnabled()

export const logger = {
  /** Jejak alur — senyap di produksi. */
  debug(...args: unknown[]): void {
    if (enabled) console.log(...args)
  },

  /** Perlu ditindak: payload ditolak, storage penuh, data tak konsisten. */
  warn(...args: unknown[]): void {
    console.warn(...args)
  },

  error(...args: unknown[]): void {
    console.error(...args)
  },

  /** Untuk test — memastikan gerbangnya memang tertutup di produksi. */
  get isDebugEnabled(): boolean {
    return enabled
  },
}
