// src/hooks/useCamera.ts
// Kamera kiosk: buka sumber (kamera HP) → tampilkan → ekspor frame base64.
//
// Hook ini TIDAK lagi memanggil getUserMedia sendiri. Pemilihan dan pembukaan
// sumber ada di src/camera/ karena sekarang ada lebih dari satu cara mendapat
// gambar dari HP (kamera virtual DroidCam atau stream MJPEG), dan keduanya
// menghasilkan elemen DOM yang berbeda. Yang tersisa di sini murni urusan
// React: siklus hidup, state untuk layar, dan canvas penangkap frame.
import { useCallback, useEffect, useRef, useState } from 'react'
import { config } from '@/api/config'
import { openCameraSource } from '@/camera/openCameraSource'
import {
  surfaceSize,
  type CameraSourceHandle,
  type CameraSourceKind,
} from '@/camera/types'
import { logger } from '@/lib/logger'

export interface CameraState {
  isActive: boolean
  ready: boolean
  error: string | null
  /** Jalur yang sedang dipakai — 'device' (kamera virtual) atau 'mjpeg'. */
  kind: CameraSourceKind | null
  /** Nama sumber untuk ditampilkan: label device atau URL stream. */
  label: string | null
  /** true bila yang terbuka kamera bawaan host, bukan kamera HP. */
  isFallback: boolean
}

const CAPTURE_WIDTH = 640
const CAPTURE_QUALITY = 0.85

const IDLE_STATE: CameraState = {
  isActive: false,
  ready: false,
  error: null,
  kind: null,
  label: null,
  isFallback: false,
}

export function useCamera() {
  const handleRef = useRef<CameraSourceHandle | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLElement | null>(null)
  // Naik setiap kali start/stop dipanggil; start() yang tokennya sudah basi
  // membuang hasilnya sendiri. Tanpa ini, stop() di tengah pembukaan kamera
  // (anak membatalkan, atau phase berpindah) meninggalkan stream hidup yang
  // tak dipegang siapa pun — dan slot tunggal DroidCam ikut tertahan.
  const tokenRef = useRef(0)
  const [state, setState] = useState<CameraState>(IDLE_STATE)

  /**
   * Ref callback untuk kontainer preview.
   *
   * Elemen kamera dipasang ke DOM, bukan disalin. ScanningScreen dulu merender
   * <video srcObject={camera.stream}> miliknya sendiri — cara yang tidak bisa
   * dipakai lagi: jalur MJPEG tidak punya MediaStream, dan elemen <img> kedua
   * berarti koneksi HTTP kedua ke HP yang akan ditolak DroidCam.
   */
  const attachPreview = useCallback((el: HTMLElement | null) => {
    containerRef.current = el
    const handle = handleRef.current
    if (el && handle) el.replaceChildren(handle.surface)
  }, [])

  const start = useCallback(async () => {
    if (handleRef.current) return
    const token = ++tokenRef.current

    setState({ ...IDLE_STATE, isActive: true })

    try {
      const handle = await openCameraSource(config.camera, window.location.origin)

      // Dibatalkan selagi menunggu — jangan biarkan kameranya menyala.
      if (token !== tokenRef.current) {
        handle.stop()
        return
      }

      handleRef.current = handle
      containerRef.current?.replaceChildren(handle.surface)

      if (!canvasRef.current) canvasRef.current = document.createElement('canvas')

      // ready langsung true: sumbernya sudah menunggu frame pertama sebelum
      // mengembalikan handle, jadi tak ada lagi jendela "aktif tapi kosong"
      // yang dulu harus dijaga polling requestAnimationFrame di sini.
      setState({
        isActive: true,
        ready: true,
        error: null,
        kind: handle.kind,
        label: handle.label,
        isFallback: handle.isFallback,
      })
    } catch (err) {
      if (token !== tokenRef.current) return
      const msg = err instanceof Error ? err.message : 'kamera tidak tersedia'
      logger.warn('[camera] ❌ gagal membuka kamera:', msg)
      setState({ ...IDLE_STATE, error: msg })
    }
  }, [])

  const stop = useCallback(() => {
    tokenRef.current++
    handleRef.current?.stop()
    handleRef.current = null
    containerRef.current?.replaceChildren()
    setState(IDLE_STATE)
  }, [])

  const captureFrame = useCallback((): string => {
    const handle = handleRef.current
    const canvas = canvasRef.current
    if (!handle || !canvas) return ''

    const { width: sw, height: sh } = surfaceSize(handle.surface)
    if (!sw || !sh) return ''

    canvas.width = CAPTURE_WIDTH
    canvas.height = Math.round(sh * (CAPTURE_WIDTH / sw))

    const ctx = canvas.getContext('2d')
    if (!ctx) return ''
    ctx.drawImage(handle.surface, 0, 0, canvas.width, canvas.height)

    try {
      return canvas.toDataURL('image/jpeg', CAPTURE_QUALITY).split(',')[1]
    } catch (err) {
      // Praktis hanya satu sebab: canvas ternoda gambar lintas-origin, yaitu
      // stream MJPEG yang tidak lewat proxy kiosk. Gejalanya menyesatkan —
      // preview tampil normal, tapi tak ada frame yang pernah sampai ke
      // classify() — jadi sebabnya disebut terang-terangan di sini.
      logger.warn(
        '[camera] ❌ frame tidak bisa diekspor (canvas ternoda). ' +
          'Stream MJPEG harus lewat /camera-proxy, bukan alamat HP langsung:',
        err,
      )
      return ''
    }
  }, [])

  // Hook membersihkan dirinya sendiri saat unmount — pemanggil tidak dititipi
  // tanggung jawab itu (pola yang sama dipakai useRealtimeDetection).
  //
  // Ref-nya di-alias ke variabel lokal karena aturan lint melarang membaca
  // `.current` langsung di dalam cleanup: untuk ref yang menunjuk node React,
  // nilainya bisa sudah berganti saat cleanup jalan. Di sini justru nilai
  // TERAKHIR yang dibutuhkan — kamera yang sedang menyala, apa pun itu.
  useEffect(() => {
    const handle = handleRef
    const token = tokenRef
    return () => {
      token.current++
      handle.current?.stop()
      handle.current = null
    }
  }, [])

  return { state, start, stop, captureFrame, attachPreview }
}
