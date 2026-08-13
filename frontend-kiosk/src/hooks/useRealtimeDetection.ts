// src/hooks/useRealtimeDetection.ts
// Real-time YOLO detection loop — capture frame → classify → track results.
import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'
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

// Jeda dan jumlah konfirmasi disetel untuk CV_MODE=vlm, di mana setiap frame
// adalah satu panggilan API berbayar dengan latensi jaringan — bukan inferensi
// lokal 35 ms yang praktis gratis.
//
// Pada 200 ms, loop mengirim lima frame per detik dan menumpuk di belakang
// latensi yang tak pernah bisa dikejarnya; pada konfirmasi 2 frame, setiap
// sortiran membayar dua kali untuk jawaban yang sama. 2000 ms + konfirmasi
// tunggal membuat satu sortiran normal selesai dalam satu panggilan.
//
// Mesin di KioskProvider tidak berubah dan tetap menanggung sisanya: bila frame
// pertama tak meyakinkan, loop mencoba lagi tiap 2 detik sampai SCAN_TIMEOUT_MS
// (10 dtk), lalu memakai deteksi terbaik yang sempat terkumpul — atau jatuh ke
// mode manual agar anak yang memutuskan, bukan sampahnya dibuang tak tersortir.
const DETECT_INTERVAL_MS = 2000
const STABLE_THRESHOLD = 0.4
const STABLE_CONFIRM_COUNT = 1
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
  // Sengaja TIDAK ikut di-reset oleh `reset()`: status jalur cloud milik layanan,
  // bukan milik satu sesi pindai. Me-reset-nya tiap pemindaian akan mencetak
  // ulang peringatan yang sama untuk setiap anak yang lewat.
  const wasDegradedRef = useRef(false)

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

      logger.debug('[detect] 🚀 Detection loop dimulai')
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
              logger.debug(`[detect] ⏱️ FPS: ${Math.round(fps)}`)
              setState((s) => ({ ...s, fps: Math.round(fps) }))
            }

            // Dicatat saat status BERUBAH, bukan tiap frame. Yang perlu diketahui
            // adalah kapan jalur utama berhenti melayani dan kapan ia pulih —
            // dua peristiwa, bukan satu keadaan yang diulang ratusan kali. Kiosk
            // menyala berhari-hari; mencatat tiap frame akan menenggelamkan
            // peralihannya sendiri di dalam pengulangan.
            const degraded = detection.degraded ?? false
            if (degraded !== wasDegradedRef.current) {
              wasDegradedRef.current = degraded
              if (degraded) {
                logger.warn(
                  `[detect] ☁️✖ Jalur utama BERHENTI melayani (${detection.degraded_reason ?? 'sebab tak diketahui'}) — jawaban kini dari model cadangan, mutunya berbeda`,
                )
              } else {
                logger.warn('[detect] ☁️✔ Jalur utama melayani lagi')
              }
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
              logger.debug(
                `[detect] 🎯 ${best.label} [${best.category}] ${(best.confidence * 100).toFixed(0)}% — stable: ${stableCountRef.current}/${STABLE_CONFIRM_COUNT}`,
              )

              if (stableCountRef.current >= STABLE_CONFIRM_COUNT) {
                logger.debug('[detect] ✅ Deteksi terkonfirmasi — loop berhenti')
                runningRef.current = false
                setState((s) => ({ ...s, isDetecting: false }))
                onConfirm(best)
                return
              }
            } else {
              if (detection.category) {
                logger.debug(
                  `[detect] ⏳ ${detection.label} [${detection.category}] ${(detection.confidence * 100).toFixed(0)}% — confidence di bawah threshold, reset stable`,
                )
              } else {
                logger.debug('[detect] ⏳ Tidak terdeteksi — menunggu objek...')
              }
              stableCountRef.current = 0
              lastConfirmedRef.current = null
            }
          } catch (err) {
            logger.debug('[detect] ⚠️ Classify gagal, skip frame:', err)
          }
        } else {
          logger.debug('[detect] ⚠️ Frame kosong — kamera belum siap')
        }

        timerRef.current = setTimeout(loop, DETECT_INTERVAL_MS)
      }

      void loop()
    },
    [reset],
  )

  const stop = useCallback(() => {
    logger.debug('[detect] 🛑 Detection loop dihentikan')
    runningRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setState((s) => ({ ...s, isDetecting: false }))
  }, [])

  // Hook ini membersihkan dirinya sendiri saat unmount, sama seperti useCamera.
  //
  // Sebelumnya tidak ada sama sekali: `runningRef` tetap true dan setTimeout
  // yang menunggu tetap menembak, sehingga loop terus memanggil classify() dan
  // setState() pada komponen yang sudah tidak ada. KioskProvider memang memanggil
  // stop() di cleanup-nya, tapi menitipkan pembersihan ke pemanggil berarti hook
  // ini bocor bagi pemakai berikutnya yang lupa melakukannya.
  //
  // Tidak memakai `stop` sebagai dependensi: itu akan menautkan pembersihan
  // unmount pada identitas sebuah callback, dan bila `stop` suatu saat tidak lagi
  // stabil, efek ini akan ikut berjalan ulang di tengah sesi — menghentikan
  // deteksi tepat saat anak sedang memindai.
  useEffect(() => {
    return () => {
      runningRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  return { state, start, stop }
}
