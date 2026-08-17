// src/camera/openCameraSource.ts
// Memilih dan membuka sumber kamera sesuai konfigurasi kiosk.
//
// Dipisah dari useCamera supaya urutan percobaannya bisa dibaca sebagai satu
// aturan, bukan tersebar di dalam efek React.
import { logger } from '@/lib/logger'
import { openDeviceSource } from './deviceSource'
import { openMjpegSource, resolveStreamUrl } from './mjpegSource'
import { parseDevicePatterns } from './pickCameraDevice'
import { CAMERA_PROXY_PATH } from './proxy'
import type { CameraSourceHandle } from './types'

export interface CameraConfig {
  readonly source: 'auto' | 'device' | 'mjpeg'
  readonly deviceMatch: string | undefined
  readonly allowBuiltinFallback: boolean
  readonly streamPath: string
  readonly readyTimeoutMs: number
}

const CAPTURE_WIDTH = 640
const CAPTURE_HEIGHT = 480

function reason(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Buka kamera sesuai `cfg.source`.
 *
 * Pada mode `auto`, urutannya disengaja:
 *   1. kamera virtual HP (device) — jalur tercepat, tanpa proxy;
 *   2. stream MJPEG dari HP — bila client di host tidak berjalan;
 *   3. kamera bawaan host — HANYA bila diizinkan, dan ditandai isFallback.
 *
 * Langkah 1 dijalankan dengan allowBuiltinFallback=false walau konfigurasinya
 * mengizinkan. Kalau tidak, ia akan langsung mengembalikan kamera laptop dan
 * langkah 2 tak pernah dicoba — kiosk memindai wajah anak padahal HP-nya
 * sebenarnya siap melayani lewat HTTP.
 */
export async function openCameraSource(
  cfg: CameraConfig,
  pageOrigin: string,
): Promise<CameraSourceHandle> {
  const patterns = parseDevicePatterns(cfg.deviceMatch)

  const openDevice = (allowBuiltinFallback: boolean) =>
    openDeviceSource({
      patterns,
      allowBuiltinFallback,
      width: CAPTURE_WIDTH,
      height: CAPTURE_HEIGHT,
      readyTimeoutMs: cfg.readyTimeoutMs,
    })

  const openMjpeg = () =>
    openMjpegSource({
      url: resolveStreamUrl(CAMERA_PROXY_PATH, cfg.streamPath),
      pageOrigin,
      readyTimeoutMs: cfg.readyTimeoutMs,
    })

  if (cfg.source === 'device') return openDevice(cfg.allowBuiltinFallback)
  if (cfg.source === 'mjpeg') return openMjpeg()

  const failures: string[] = []

  try {
    return await openDevice(false)
  } catch (err) {
    failures.push(`kamera virtual: ${reason(err)}`)
    logger.debug('[camera] kamera virtual tidak terpakai —', reason(err))
  }

  try {
    return await openMjpeg()
  } catch (err) {
    failures.push(`stream MJPEG: ${reason(err)}`)
    logger.debug('[camera] stream MJPEG tidak terpakai —', reason(err))
  }

  if (cfg.allowBuiltinFallback) {
    try {
      return await openDevice(true)
    } catch (err) {
      failures.push(`kamera bawaan: ${reason(err)}`)
    }
  }

  throw new Error(`tidak ada sumber kamera yang bisa dibuka — ${failures.join(' | ')}`)
}
