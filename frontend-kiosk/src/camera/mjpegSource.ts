// src/camera/mjpegSource.ts
// Sumber kamera dari stream MJPEG HTTP yang disajikan app di HP
// (DroidCam :4747/mjpegfeed, IP Webcam :8080/video, dsb).
//
// Tidak butuh modul kernel apa pun di host — cukup HP dan jaringan yang sama.
// Browser sudah bisa men-decode multipart/x-mixed-replace sejak lama; satu
// elemen <img> yang menunjuk ke feed itu adalah video yang berjalan sendiri.
//
// SATU syarat yang tidak bisa ditawar: URL-nya harus SAME-ORIGIN dengan kiosk.
// Gambar lintas-origin tanpa header CORS akan "menodai" (taint) canvas, dan
// canvas yang ternoda membuat toDataURL() melempar SecurityError — persis
// langkah yang dipakai captureFrame() untuk mengirim frame ke classify().
// Gambarnya terlihat di layar, tapi tak sebuah frame pun bisa dikirim.
//
// Karena itu kiosk selalu menunjuk ke path proxy-nya sendiri (/camera-proxy),
// dan yang meneruskan ke HP adalah dev-server Vite atau nginx — lihat
// vite.config.ts dan nginx.conf.
import { logger } from '@/lib/logger'
import { styleSurface, waitForSurface, type CameraSourceHandle } from './types'

export interface MjpegSourceOptions {
  /** URL yang dimuat <img>. Seharusnya path same-origin lewat proxy. */
  url: string
  /** Origin halaman kiosk — dipisah dari window agar bisa diuji. */
  pageOrigin: string
  readyTimeoutMs: number
}

/** Gabungkan path proxy dan path feed jadi satu URL yang rapi. */
export function resolveStreamUrl(proxyPath: string, streamPath: string): string {
  // Path feed absolut = operator sengaja melewati proxy. Dibiarkan, tapi
  // openMjpegSource() akan memperingatkan konsekuensinya pada canvas.
  if (/^https?:\/\//i.test(streamPath)) return streamPath

  const base = proxyPath.replace(/\/+$/, '')
  const tail = streamPath.startsWith('/') ? streamPath : `/${streamPath}`
  return `${base}${tail}`
}

/** Apakah URL ini akan menodai canvas? Relatif = selalu aman. */
export function isCrossOrigin(url: string, pageOrigin: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  try {
    return new URL(url).origin !== pageOrigin
  } catch {
    return false
  }
}

export async function openMjpegSource(opts: MjpegSourceOptions): Promise<CameraSourceHandle> {
  const crossOrigin = isCrossOrigin(opts.url, opts.pageOrigin)

  const img = document.createElement('img')
  styleSurface(img)
  if (crossOrigin) {
    // Tanpa ini canvas ternoda dan captureFrame() melempar SecurityError.
    // Dengan ini, server yang tak mengirim header CORS akan gagal memuat
    // gambar sama sekali — kegagalan yang terlihat, bukan yang tersembunyi.
    img.crossOrigin = 'anonymous'
    logger.warn(
      `[camera] ⚠️ stream MJPEG lintas-origin (${opts.url}) — DroidCam tidak mengirim header CORS. ` +
        'Arahkan VITE_CAMERA_STREAM_PATH ke proxy kiosk (/camera-proxy/...) sebagai gantinya.',
    )
  }

  const stop = () => {
    img.onerror = null
    // Memutus koneksi HTTP-nya. Wajib: DroidCam gratis hanya melayani satu
    // pembaca, jadi stream yang dibiarkan menggantung membuat pemindaian
    // berikutnya gagal dengan "Busy".
    img.removeAttribute('src')
  }

  // Dipasang SEBELUM src diisi — kalau tidak, kegagalan cepat (host mati,
  // koneksi ditolak) sudah lewat sebelum ada yang mendengarkan.
  const failure = new Promise<never>((_, reject) => {
    img.onerror = () =>
      reject(
        new Error(
          crossOrigin
            ? `stream MJPEG ditolak browser (lintas-origin tanpa CORS): ${opts.url}`
            : `stream MJPEG tidak bisa dibuka: ${opts.url}`,
        ),
      )
  })

  // Sengaja TANPA cache-buster. Respons multipart/x-mixed-replace tidak
  // di-cache browser, sedangkan DroidCam membaca query string sebagai
  // resolusi (?640x480) — menempelkan parameter asing justru merusaknya.
  img.src = opts.url

  try {
    await Promise.race([waitForSurface(img, opts.readyTimeoutMs), failure])
  } catch (err) {
    stop()
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `${detail}. Pastikan app kamera di HP AKTIF DI DEPAN LAYAR (bukan latar) ` +
        'dan alamat/port-nya cocok dengan VITE_CAMERA_STREAM_URL.',
    )
  }

  logger.debug(`[camera] 📱 stream MJPEG dipakai: ${opts.url}`)

  return {
    kind: 'mjpeg',
    label: opts.url,
    surface: img,
    isFallback: false,
    stop,
  }
}
