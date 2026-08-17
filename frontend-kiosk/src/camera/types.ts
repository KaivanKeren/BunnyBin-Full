// src/camera/types.ts
// Kontrak bersama untuk semua sumber kamera kiosk.
//
// Kiosk tidak lagi mengandaikan satu-satunya cara mendapat gambar adalah
// getUserMedia pada kamera bawaan laptop. Ada dua jalan menuju kamera HP, dan
// keduanya menghasilkan benda yang berbeda:
//
//   device — client DroidCam/Iriun di host menaruh feed HP sebagai kamera
//            virtual (v4l2loopback). Browser melihatnya sebagai videoinput
//            biasa, jadi hasilnya elemen <video> ber-MediaStream.
//   mjpeg  — app di HP menyajikan MJPEG lewat HTTP. Browser cukup <img>, tanpa
//            modul kernel apa pun, tapi harus lewat proxy same-origin supaya
//            canvas tidak ter-taint (lihat mjpegSource.ts).
//
// Yang disamakan di sini hanya yang benar-benar dibutuhkan pemanggil: sebuah
// permukaan yang bisa digambar ke canvas sekaligus ditampilkan, dan cara
// mematikannya.
export type CameraSourceKind = 'device' | 'mjpeg'

/** Permukaan yang bisa dipakai ctx.drawImage() — <video> atau <img>. */
export type CameraSurface = HTMLVideoElement | HTMLImageElement

export interface CameraSourceHandle {
  kind: CameraSourceKind
  /** Nama sumber untuk ditampilkan ke operator (label device / URL stream). */
  label: string
  /**
   * SATU elemen yang dipakai untuk dua hal sekaligus: sumber drawImage() dan
   * preview di layar (lihat attachPreview di useCamera).
   *
   * Sengaja satu, bukan sepasang. Pada jalur MJPEG, tiap elemen <img> adalah
   * satu koneksi HTTP tersendiri ke HP — dan DroidCam versi gratis hanya
   * melayani satu pembaca. Elemen tangkap dan elemen tampil yang terpisah
   * berarti yang kedua selalu gagal dengan "Busy".
   */
  surface: CameraSurface
  /**
   * true bila yang terbuka BUKAN kamera HP yang diminta, melainkan kamera
   * bawaan sebagai jaring pengaman. Bukan error — tapi harus terlihat, karena
   * kamera bawaan kiosk umumnya menghadap ke arah yang salah.
   */
  isFallback: boolean
  stop(): void
}

/** Ukuran gambar sesungguhnya, 0×0 bila sumber belum memuat frame pertama. */
export function surfaceSize(surface: CameraSurface): { width: number; height: number } {
  return surface instanceof HTMLVideoElement
    ? { width: surface.videoWidth, height: surface.videoHeight }
    : { width: surface.naturalWidth, height: surface.naturalHeight }
}

/** Sudah ada frame yang bisa digambar? */
export function surfaceReady(surface: CameraSurface): boolean {
  const { width, height } = surfaceSize(surface)
  return width > 0 && height > 0
}

/** Isi penuh kontainer preview, apa pun jenis elemennya. */
export function styleSurface(surface: CameraSurface): void {
  surface.style.width = '100%'
  surface.style.height = '100%'
  surface.style.objectFit = 'cover'
}

/**
 * Tunggu sampai permukaan punya dimensi nyata, atau menyerah.
 *
 * Batas waktunya bukan hiasan. Kamera virtual v4l2loopback tetap ADA di
 * /dev/video2 walau client DroidCam tidak berjalan: getUserMedia berhasil,
 * track-nya "live", tapi tak satu frame pun datang. Tanpa tenggat, kiosk
 * menunggu selamanya sambil menulis "Memulai kamera..." — kegagalan yang paling
 * sulit didiagnosis di lapangan. Dengan tenggat, ia jadi pesan yang jelas.
 *
 * Memakai setTimeout, bukan requestAnimationFrame: rAF berhenti ditembakkan
 * saat tab kiosk tidak di depan, dan kiosk memang bisa ditinggal di latar.
 */
export function waitForSurface(surface: CameraSurface, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (surfaceReady(surface)) {
      resolve()
      return
    }
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      if (surfaceReady(surface)) {
        resolve()
        return
      }
      if (Date.now() >= deadline) {
        reject(new Error(`kamera tidak mengirim gambar dalam ${Math.round(timeoutMs / 1000)} detik`))
        return
      }
      setTimeout(tick, 50)
    }
    setTimeout(tick, 50)
  })
}
