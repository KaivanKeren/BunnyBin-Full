// src/camera/deviceSource.ts
// Sumber kamera lewat getUserMedia, dengan pilihan device yang EKSPLISIT.
//
// Dipakai saat feed HP masuk sebagai kamera virtual di host — misalnya
// `droidcam-cli` yang menulis ke v4l2loopback (/dev/video2). Bagi browser itu
// videoinput biasa, jadi satu-satunya yang membedakannya dari kamera bawaan
// laptop adalah LABEL-nya.
import { logger } from '@/lib/logger'
import { pickCameraDevice, type VideoInputLike } from './pickCameraDevice'
import { styleSurface, waitForSurface, type CameraSourceHandle } from './types'

export interface DeviceSourceOptions {
  /** Pola label kamera HP, urut prioritas. Kosong = pakai kamera default host. */
  patterns: readonly string[]
  /** Boleh jatuh ke kamera bawaan bila tak ada yang cocok? */
  allowBuiltinFallback: boolean
  width: number
  height: number
  readyTimeoutMs: number
}

function stopStream(stream: MediaStream): void {
  stream.getTracks().forEach((t) => t.stop())
}

/**
 * Daftar kamera yang terlihat browser.
 *
 * Label baru terisi SETELAH satu izin kamera diberikan; sebelum itu
 * enumerateDevices() mengembalikan entri berlabel string kosong. Itu sebabnya
 * openDeviceSource() membuka stream dulu, baru memilih.
 */
export async function listVideoInputs(): Promise<VideoInputLike[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label }))
}

export async function openDeviceSource(opts: DeviceSourceOptions): Promise<CameraSourceHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'browser tidak mengizinkan akses kamera — halaman harus dibuka lewat https atau localhost',
    )
  }

  const base: MediaTrackConstraints = {
    width: { ideal: opts.width },
    height: { ideal: opts.height },
  }

  // Buka apa adanya lebih dulu: ini yang memicu prompt izin dan membuka label
  // semua device. Tanpa langkah ini, pencocokan label selalu gagal pada
  // kunjungan pertama dan kiosk diam-diam memakai kamera bawaan.
  let stream = await navigator.mediaDevices.getUserMedia({ video: base, audio: false })

  let picked: VideoInputLike | null = null
  let isFallback = false

  try {
    const devices = await listVideoInputs()
    picked = pickCameraDevice(devices, opts.patterns)

    if (picked) {
      const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId
      if (activeId !== picked.deviceId) {
        // Tutup stream sementara SEBELUM membuka yang benar. DroidCam hanya
        // melayani satu pembaca; membiarkan dua stream hidup berarti yang kedua
        // gagal dengan NotReadableError.
        stopStream(stream)
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...base, deviceId: { exact: picked.deviceId } },
          audio: false,
        })
      }
      logger.debug(`[camera] 📱 kamera HP dipakai: ${picked.label}`)
    } else if (opts.patterns.length === 0) {
      // Pola sengaja dikosongkan operator → kamera default host memang yang
      // diminta. Bukan fallback, jadi tak perlu peringatan.
      logger.debug('[camera] kamera default host dipakai (pola pencocokan kosong)')
    } else if (opts.allowBuiltinFallback) {
      isFallback = true
      logger.warn(
        `[camera] ⚠️ kamera HP tidak ditemukan (pola: ${opts.patterns.join(', ')}) — memakai kamera bawaan. ` +
          'Jalankan scripts/setup-droidcam.sh lalu muat ulang kiosk.',
      )
    } else {
      throw new Error(
        `kamera HP tidak ditemukan (pola: ${opts.patterns.join(', ')}). ` +
          'Jalankan scripts/setup-droidcam.sh di host, pastikan app DroidCam di HP aktif di depan layar.',
      )
    }

    const video = document.createElement('video')
    video.setAttribute('playsinline', 'true')
    video.muted = true
    video.autoplay = true
    styleSurface(video)
    video.srcObject = stream
    await video.play()
    await waitForSurface(video, opts.readyTimeoutMs)

    const activeStream = stream
    return {
      kind: 'device',
      label: picked?.label || 'kamera default host',
      surface: video,
      isFallback,
      stop: () => {
        stopStream(activeStream)
        video.srcObject = null
      },
    }
  } catch (err) {
    // Stream yang sudah telanjur terbuka harus ditutup di SETIAP jalur gagal.
    // Kalau tidak, lampu kamera tetap menyala dan slot tunggal DroidCam tetap
    // terpakai — percobaan berikutnya gagal karena kegagalan sebelumnya.
    stopStream(stream)
    throw err
  }
}
