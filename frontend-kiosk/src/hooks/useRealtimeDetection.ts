// src/hooks/useRealtimeDetection.ts
// Real-time YOLO detection loop — capture frame → classify → track results.
import { useCallback, useRef, useState } from 'react'
import type { CvDetection } from '@/api/contracts'

export interface LiveDetection {
  detection: CvDetection
  timestamp: number
}

export interface RealtimeDetectionState {
  liveDetection: CvDetection | null
  isDetecting: boolean
  fps: number
}

const DETECT_INTERVAL_MS = 200
const STABLE_THRESHOLD = 0.4
const STABLE_CONFIRM_COUNT = 2
const MAX_HISTORY = 10

export function useRealtimeDetection() {
  const [state, setState] = useState<RealtimeDetectionState>({
    liveDetection: null,
    isDetecting: false,
    fps: 0,
  })

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = useRef(false)
  const historyRef = useRef<LiveDetection[]>([])
  const stableCountRef = useRef(0)
  const lastConfirmedRef = useRef<CvDetection | null>(null)
  const frameCountRef = useRef(0)
  const fpsTimerRef = useRef<number>(Date.now())

  const reset = useCallback(() => {
    historyRef.current = []
    stableCountRef.current = 0
    lastConfirmedRef.current = null
    frameCountRef.current = 0
    fpsTimerRef.current = Date.now()
  }, [])

  const start = useCallback(
    (
      captureFrame: () => string,
      classify: (imageBase64: string) => Promise<CvDetection>,
      onConfirm: (detection: CvDetection) => void,
    ) => {
      if (runningRef.current) return
      runningRef.current = true
      reset()

      console.log('[detect] 🚀 Detection loop dimulai')
      setState((s) => ({ ...s, isDetecting: true }))

      const loop = async () => {
        if (!runningRef.current) return

        const frame = captureFrame()
        if (frame) {
          try {
            const detection = await classify(frame)
            if (!runningRef.current) return

            frameCountRef.current++
            const now = Date.now()
            const elapsed = now - fpsTimerRef.current
            if (elapsed >= 1000) {
              const fps = (frameCountRef.current / elapsed) * 1000
              frameCountRef.current = 0
              fpsTimerRef.current = now
              console.log(`[detect] ⏱️ FPS: ${Math.round(fps)}`)
              setState((s) => ({ ...s, fps: Math.round(fps) }))
            }

            const entry: LiveDetection = { detection, timestamp: now }
            historyRef.current.push(entry)
            if (historyRef.current.length > MAX_HISTORY) {
              historyRef.current.shift()
            }

            setState((s) => ({ ...s, liveDetection: detection }))

            if (detection.confidence >= STABLE_THRESHOLD && detection.category) {
              // Konfirmasi berbasis KATEGORI (organic/inorganic), bukan label objek.
              // Model multi-kelas kadang menggoyang label antar-frame (botol↔wadah↔gelas)
              // walau kategorinya stabil; kalau syaratnya label sama persis, hitungan
              // stabil ter-reset terus sehingga deteksi baru muncul saat scan timeout.
              const sameCategory = lastConfirmedRef.current?.category === detection.category
              if (sameCategory) {
                stableCountRef.current++
                // simpan deteksi paling percaya-diri sebagai wakil (label terbaik)
                if (detection.confidence > (lastConfirmedRef.current?.confidence ?? 0)) {
                  lastConfirmedRef.current = detection
                }
              } else {
                stableCountRef.current = 1
                lastConfirmedRef.current = detection
              }

              const best = lastConfirmedRef.current ?? detection
              console.log(
                `[detect] 🎯 ${best.label} [${best.category}] ${(best.confidence * 100).toFixed(0)}% — stable: ${stableCountRef.current}/${STABLE_CONFIRM_COUNT}`,
              )

              if (stableCountRef.current >= STABLE_CONFIRM_COUNT) {
                console.log('[detect] ✅ Deteksi terkonfirmasi — loop berhenti')
                runningRef.current = false
                setState((s) => ({ ...s, isDetecting: false }))
                onConfirm(best)
                return
              }
            } else {
              if (detection.category) {
                console.log(
                  `[detect] ⏳ ${detection.label} [${detection.category}] ${(detection.confidence * 100).toFixed(0)}% — confidence di bawah threshold, reset stable`,
                )
              } else {
                console.log('[detect] ⏳ Tidak terdeteksi — menunggu objek...')
              }
              stableCountRef.current = 0
              lastConfirmedRef.current = null
            }
          } catch (err) {
            console.warn('[detect] ⚠️ Classify gagal, skip frame:', err)
          }
        } else {
          console.warn('[detect] ⚠️ Frame kosong — kamera belum siap')
        }

        timerRef.current = setTimeout(loop, DETECT_INTERVAL_MS)
      }

      void loop()
    },
    [reset],
  )

  const stop = useCallback(() => {
    console.log('[detect] 🛑 Detection loop dihentikan')
    runningRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setState((s) => ({ ...s, isDetecting: false }))
  }, [])

  return { state, start, stop }
}
