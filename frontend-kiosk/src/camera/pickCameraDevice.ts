// src/camera/pickCameraDevice.ts
// Pemilihan kamera dari daftar videoinput — fungsi murni supaya bisa diuji
// tanpa browser (lihat pickCameraDevice.test.ts).
//
// Dulu kiosk memakai `facingMode: 'environment'` dan menyerahkan pilihan ke
// browser. Di HP itu berarti kamera belakang, tapi di laptop constraint itu
// tidak punya arti: tidak ada kamera "belakang", jadi browser memberi apa pun
// yang ada — kamera depan yang menghadap wajah anak, bukan sampahnya.
//
// Sekarang pilihan dibuat eksplisit lewat pencocokan LABEL: kamera virtual yang
// dibuat client DroidCam/Iriun/IP Webcam punya nama yang bisa dikenali.

/** Bentuk minimal MediaDeviceInfo yang dipakai — cukup untuk diuji tanpa DOM. */
export interface VideoInputLike {
  deviceId: string
  label: string
}

/**
 * Pola bawaan, urut dari yang paling spesifik. Semuanya adalah nama kamera
 * virtual yang dipasang client "HP jadi webcam" di host:
 *   droidcam  → droidcam-cli (v4l2loopback), nama kartu "Droidcam"
 *   iriun     → Iriun Webcam
 *   ivcam / epoccam → client iOS
 *   ip webcam → IP Webcam (Android) via adapter v4l2
 *   v4l2 loopback / dummy video → nama bawaan modul bila client tidak menamai
 */
export const DEFAULT_DEVICE_PATTERNS = [
  'droidcam',
  'iriun',
  'ivcam',
  'epoccam',
  'ip webcam',
  'v4l2 loopback',
  'dummy video',
] as const

/** Ubah nilai env "droidcam, iriun" jadi daftar pola bersih. */
export function parseDevicePatterns(raw: string | undefined): string[] {
  if (raw === undefined) return [...DEFAULT_DEVICE_PATTERNS]
  const parsed = raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0)
  // String kosong berarti "jangan cocokkan apa pun", bukan "pakai bawaan" —
  // operator yang sengaja mengosongkannya ingin kamera default host.
  return parsed
}

/**
 * Pilih videoinput pertama yang labelnya memuat salah satu pola.
 *
 * Urutan POLA yang menentukan prioritas, bukan urutan device: dengan
 * `['droidcam','iriun']`, DroidCam tetap menang walau Iriun terdaftar lebih
 * dulu oleh sistem.
 *
 * Mengembalikan null bila tidak ada yang cocok — termasuk saat label masih
 * kosong karena izin kamera belum diberikan. Pemanggil yang menentukan apakah
 * itu berarti "pakai kamera bawaan" atau "gagal".
 */
export function pickCameraDevice(
  devices: readonly VideoInputLike[],
  patterns: readonly string[],
): VideoInputLike | null {
  for (const pattern of patterns) {
    const needle = pattern.trim().toLowerCase()
    if (!needle) continue
    const hit = devices.find((d) => d.label.toLowerCase().includes(needle))
    if (hit) return hit
  }
  return null
}
