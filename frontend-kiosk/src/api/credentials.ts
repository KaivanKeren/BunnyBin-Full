// src/api/credentials.ts
// Kredensial device disimpan di localStorage perangkat, BUKAN di bundle.
//
// Sebelumnya token datang dari VITE_KIOSK_API_TOKEN. Semua variabel VITE_*
// di-inline saat build, jadi token itu selalu berakhir sebagai teks polos di
// dalam file .js yang dilayankan ke browser — terbaca lewat View Source atau
// DevTools di tablet yang menempel di tong sampah sekolah, dan dipakai anak-anak
// tanpa pengawasan penuh. Merotasinya hanya memperpendek umur kebocoran.
//
// Sekarang kiosk menukar kode aktivasi sekali pakai dengan tokennya sendiri
// (POST /devices/activate), lalu menyimpannya di sini. Rahasianya tidak pernah
// ikut ter-build, dan tiap perangkat memegang tokennya masing-masing.

const TOKEN_KEY = 'binexa.kiosk.token'
const UNIT_CODE_KEY = 'binexa.kiosk.unitCode'

export interface KioskCredentials {
  token: string
  unitCode: string
}

/** null bila perangkat ini belum pernah diaktivasi. */
export function readCredentials(): KioskCredentials | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const unitCode = localStorage.getItem(UNIT_CODE_KEY)

    return token && unitCode ? { token, unitCode } : null
  } catch {
    // Mode privat / storage diblokir kebijakan perangkat. Kiosk tetap boleh
    // berjalan (layar aktivasi muncul lagi), jadi ini bukan alasan untuk crash.
    return null
  }
}

export function saveCredentials(credentials: KioskCredentials): void {
  try {
    localStorage.setItem(TOKEN_KEY, credentials.token)
    localStorage.setItem(UNIT_CODE_KEY, credentials.unitCode)
  } catch {
    // Diabaikan dengan sengaja: sesi ini tetap berjalan memakai kredensial di
    // memori, hanya tidak bertahan setelah reload.
  }
}

/**
 * Dipakai saat server menolak token secara permanen — perangkat harus kembali
 * ke layar aktivasi ketimbang mengulang request yang tidak akan pernah berhasil.
 */
export function clearCredentials(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(UNIT_CODE_KEY)
  } catch {
    // sama seperti di atas
  }
}
