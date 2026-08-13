// src/context/KioskProvider.tsx
// Orchestrator kiosk: state machine + client contracts + polling ESP32 + retry queue.
// "Laravel selalu orchestrator" → alur CV lewat cloud.classify() (§5).
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  CvDetection,
  Esp32Status,
  FillReport,
  QuizItem,
  SortLogPayload,
  WasteCategory,
} from '@/api/contracts'
import { config } from '@/api/config'
import { CloudRejectedError } from '@/api/errors'
import { getClients } from '@/api/index'
import { SortLogQueue } from '@/api/sortLogQueue'
import { MockEsp32Client } from '@/api/mock/MockEsp32Client'
import { mockControls } from '@/api/mock/mockControls'
import { useCamera } from '@/hooks/useCamera'
import { useRealtimeDetection } from '@/hooks/useRealtimeDetection'
import { logger } from '@/lib/logger'
import { playClick, playError, playSuccess } from '@/lib/sound'
import { decideAnswer } from '@/machine/answerDecision'
import { pickQuizItem } from '@/machine/pickQuizItem'
import {
  fillLocked,
  initialState,
  kioskReducer,
  type Phase,
} from '@/machine/kioskReducer'
import quizBankRaw from '@/mocks/quizBank.json'
import { KioskContext, type KioskApi } from './kioskContext'

// 15 dtk, bukan 10: sejak CV_MODE=gemini, satu klasifikasi bisa memakan hingga
// 10 dtk sebelum layanan menyerah dan menjatuhkannya ke model lokal (batas itu
// tidak bisa dikecilkan — Gemini menolak deadline di bawah 10 dtk). Pada jendela
// 10 dtk, kiosk menyerah lebih dulu dan cadangan lokal tak pernah sempat
// menjawab: anak dilempar ke mode manual padahal jaring pengamannya ada.
const SCAN_TIMEOUT_MS = 15000
const SUCCESS_MS = 5000
const ERROR_AUTO_MS = 9000
const POLL_MS = 2000
const RETRY_MS = 30000

const fallbackBank = quizBankRaw as unknown as QuizItem[]

// Hanya dipakai Debug Panel (forcePhase) untuk memunculkan item contoh.
// Pemilihan kuis yang sesungguhnya ada di @/machine/pickQuizItem.
function randomFrom<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null
}

function fillReportFrom(status: Esp32Status): FillReport {
  if (status.organic_distance_cm !== undefined && status.inorganic_distance_cm !== undefined) {
    return {
      organic_distance_cm: status.organic_distance_cm,
      inorganic_distance_cm: status.inorganic_distance_cm,
    }
  }
  return {
    organic_pct: Math.round(status.organic_pct),
    inorganic_pct: Math.round(status.inorganic_pct),
  }
}

function displayFill(
  status: Esp32Status,
  cloud: Pick<Esp32Status, 'organic_pct' | 'inorganic_pct'> | null,
): Esp32Status {
  const hasDistances =
    status.organic_distance_cm !== undefined && status.inorganic_distance_cm !== undefined
  return hasDistances && cloud !== null ? { ...status, ...cloud } : status
}

export function KioskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(kioskReducer, initialState)
  const clients = useRef(getClients()).current
  const camera = useCamera()
  const realtimeDetection = useRealtimeDetection()

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const quizItemsRef = useRef<QuizItem[]>(fallbackBank)
  // Lazy initializer useState, bukan useRef: antrean membaca localStorage saat
  // dibuat, dan useRef akan menjalankan konstruktornya di SETIAP render lalu
  // membuang hasilnya. Instance-nya sendiri stabil sepanjang umur komponen.
  //
  // Antrean memuat isinya sendiri — log sortir yang tertahan sebelum
  // reload/reboot langsung ada kembali di sini.
  const [retryQueue] = useState(() => new SortLogQueue())
  const lastStatusRef = useRef<Esp32Status | null>(null)
  const cloudFillRef = useRef<Pick<Esp32Status, 'organic_pct' | 'inorganic_pct'> | null>(null)
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bestDetectionRef = useRef<CvDetection | null>(null)
  const cameraReadyRef = useRef(false)
  /** Sudah menggerakkan servo untuk benda yang sedang diproses? */
  const sortedRef = useRef(false)

  // Sync camera ready state into ref (avoids stale closure in polling loops)
  useEffect(() => {
    cameraReadyRef.current = camera.state.ready
  }, [camera.state.ready])

  const setQueueLength = useCallback(() => {
    dispatch({ type: 'SET_QUEUE_LENGTH', length: retryQueue.length })
  }, [retryQueue])

  const applyFill = useCallback((status: Esp32Status) => {
    const fill = displayFill(status, cloudFillRef.current)
    dispatch({ type: 'FILL_UPDATE', fill })
    if (fillLocked(fill)) dispatch({ type: 'FULL_LOCK' })
    else dispatch({ type: 'FULL_RELEASE' })
  }, [])

  /**
   * Gerakkan servo, sekali saja per benda.
   *
   * Penjaga sortedRef diperlukan karena sekarang ADA DUA jalan menuju sortir:
   * jawaban benar, dan sortir pengaman saat layar penjelasan habis waktunya.
   * Tanpa penjaga, anak yang menjawab salah lalu benar akan menggerakkan servo
   * dua kali untuk satu benda — dan MG996R yang bergerak sia-sia adalah keausan
   * mekanis yang bisa dihindari.
   */
  const sortTrash = useCallback(
    async (category: WasteCategory) => {
      if (sortedRef.current) return
      sortedRef.current = true

      try {
        await clients.esp32.sort({ category })
        dispatch({ type: 'SET_ESP32_OFFLINE', offline: false })
      } catch {
        dispatch({ type: 'SET_ESP32_OFFLINE', offline: true })
      }
    },
    [clients],
  )

  // --- Muat quiz bank ---
  useEffect(() => {
    let active = true
    clients.cloud
      .getQuizBank()
      .then((items) => {
        if (!active) return
        if (items.length) quizItemsRef.current = items
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      })
      .catch(() => {
        if (!active) return
        quizItemsRef.current = fallbackBank
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: true })
      })
    return () => {
      active = false
    }
  }, [clients])

  // --- Polling ESP32 ---
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    async function poll() {
      try {
        const status = await clients.esp32.getStatus()
        if (cancelled) return
        lastStatusRef.current = status
        applyFill(status)
        dispatch({ type: 'SET_ESP32_OFFLINE', offline: false })
      } catch {
        if (!cancelled) {
          lastStatusRef.current = null
          dispatch({ type: 'SET_ESP32_OFFLINE', offline: true })
        }
      } finally {
        if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [clients, applyFill])

  // --- Relay ESP32 → Laravel ---
  useEffect(() => {
    let cancelled = false
    async function relay() {
      const status = lastStatusRef.current
      try {
        if (status === null) {
          await clients.cloud.heartbeat()
        } else {
          const ack = await clients.cloud.reportFill(fillReportFrom(status))
          if (cancelled) return
          cloudFillRef.current = {
            organic_pct: ack.organic_pct,
            inorganic_pct: ack.inorganic_pct,
          }
          applyFill(status)
        }
        if (!cancelled) dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      } catch (err) {
        if (cancelled) return
        if (err instanceof CloudRejectedError) return
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: true })
      }
    }
    const id = setInterval(() => void relay(), config.fillRelayMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [clients, applyFill])

  // --- Retry queue logSort ---
  useEffect(() => {
    async function flush() {
      if (!retryQueue.length) return

      while (retryQueue.length) {
        const next = retryQueue.peek()
        if (next === null) break

        try {
          await clients.cloud.logSort(next)
          retryQueue.shift()
        } catch (err) {
          if (err instanceof CloudRejectedError) {
            logger.warn('[kiosk] log sortiran ditolak server, dibuang:', err.message, next)
            retryQueue.shift()
            continue
          }
          // Gagal jaringan: berhenti, coba lagi di tick berikutnya. Antrean
          // sudah tersimpan di localStorage, jadi aman melewati reload.
          break
        }
      }

      if (!retryQueue.length) dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      setQueueLength()
    }

    // Flush SEGERA saat mount, bukan menunggu tick 30 detik pertama. Antrean
    // yang dipulihkan dari reload sering sudah menunggu lama; menahannya 30
    // detik lagi hanya memperbesar jendela kehilangan bila tablet dimatikan.
    setQueueLength()
    void flush()

    const id = setInterval(() => void flush(), RETRY_MS)
    return () => clearInterval(id)
  }, [clients, retryQueue, setQueueLength])

  // --- Auto-reset success / error ---
  useEffect(() => {
    if (state.phase === 'success') {
      camera.stop()
      realtimeDetection.stop()
      const t = setTimeout(() => dispatch({ type: 'RESET' }), SUCCESS_MS)
      return () => clearTimeout(t)
    }
    if (state.phase === 'error') {
      camera.stop()
      realtimeDetection.stop()

      // SORTIR PENGAMAN. Anak yang menjawab salah lalu pergi meninggalkan
      // sampahnya menggantung di tray netral: dulu jalur ini tidak pernah
      // memanggil esp32.sort() sama sekali, jadi benda itu tidak masuk ke tong
      // mana pun dan tong berikutnya mewarisi kekacauannya.
      //
      // Kategorinya diambil dari DETEKSI, bukan dari jawaban anak yang keliru.
      // sortTrash() no-op bila anak sempat kembali dan menjawab benar.
      const t = setTimeout(() => {
        const detected = stateRef.current.detection?.category ?? null
        void (async () => {
          if (detected !== null) await sortTrash(detected)
          dispatch({ type: 'RESET' })
        })()
      }, ERROR_AUTO_MS)

      return () => clearTimeout(t)
    }
  }, [state.phase, camera, realtimeDetection, sortTrash])

  // Hanya timer scan yang perlu dibersihkan di sini.
  //
  // Dulu blok ini juga memanggil camera.stop() dan realtimeDetection.stop()
  // dengan dependensi kosong — stale closure yang di-flag lint. Menambahkan
  // `camera`/`realtimeDetection` ke dependensi JUSTRU merusak: objeknya berubah
  // identitas setiap kali state kamera berubah, sehingga cleanup ikut berjalan
  // di tengah sesi dan mematikan kamera saat anak sedang memindai.
  //
  // Perbaikannya bukan menambal dependensi, melainkan memindahkan tanggung
  // jawab: kedua hook kini membersihkan dirinya sendiri saat unmount.
  useEffect(() => {
    return () => {
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current)
    }
  }, [])

  const enqueueLog = useCallback(
    async (payload: SortLogPayload) => {
      try {
        await clients.cloud.logSort(payload)
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      } catch (err) {
        if (err instanceof CloudRejectedError) {
          logger.warn('[kiosk] log sortiran ditolak server:', err.message, payload)
          return
        }
        retryQueue.push(payload)
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: true })
        setQueueLength()
      }
    },
    [clients, retryQueue, setQueueLength],
  )

  // Logikanya ada di @/machine/pickQuizItem — fungsi murni yang bisa diuji tanpa
  // merender komponen. Tabel label→kuis ada di @/lib/labelToQuiz.
  const pickItem = useCallback(
    (detection: CvDetection): QuizItem | null => pickQuizItem(quizItemsRef.current, detection),
    [],
  )

  // --- Alur: masukkan sampah → scan (real-time) → question ---
  const insertTrash = useCallback(() => {
    if (stateRef.current.phase !== 'idle') return
    playClick(stateRef.current.muted)
    logger.debug('[kiosk] 📷 Memulai scan — phase → scanning')
    dispatch({ type: 'SCAN_START' })

    bestDetectionRef.current = null
    // Benda baru → servo boleh bergerak lagi.
    sortedRef.current = false

    // Start camera
    void camera.start()

    // Timeout fallback: if nothing confirmed in SCAN_TIMEOUT_MS,
    // use the best detection we have (highest confidence) and proceed
    scanTimeoutRef.current = setTimeout(() => {
      scanTimeoutRef.current = null
      if (stateRef.current.phase !== 'scanning') return

      const best = bestDetectionRef.current
      logger.debug('[kiosk] ⏰ Scan timeout — menggunakan best detection:', best)

      realtimeDetection.stop()
      camera.stop()

      if (best && best.category) {
        const item = pickItem(best)
        if (item) {
          dispatch({ type: 'SCAN_DONE', detection: best, item })
          return
        }
      }

      // Tidak ada deteksi sama sekali → MODE MANUAL, bukan reset.
      //
      // Dulu jalur ini memilih quiz item acak dari seluruh bank (bisa lintas
      // kategori) atau, bila banknya kosong, langsung RESET ke idle — sementara
      // sampah anak sudah terlanjur masuk. Keduanya salah dengan cara berbeda:
      // yang pertama menyortir ke tong yang keliru, yang kedua meninggalkannya
      // tanpa disortir sama sekali. Sekarang anak yang memutuskan.
      const fallback: CvDetection = {
        category: null,
        label: null,
        confidence: 0,
        bbox: null,
        model_version: 'timeout',
      }
      dispatch({ type: 'SCAN_DONE', detection: fallback, item: null })
    }, SCAN_TIMEOUT_MS)

    // Start real-time detection loop — wait for camera to be truly ready
    const startDetectionWhenReady = () => {
      if (stateRef.current.phase !== 'scanning') return
      if (cameraReadyRef.current) {
        logger.debug('[kiosk] 🎥 Kamera ready — memulai detection loop')
        realtimeDetection.start(
          camera.captureFrame,
          async (imageBase64: string) => {
            logger.debug(`[kiosk] 🔍 Mengirim frame ke classify (${imageBase64.length} bytes)`)
            const result = await clients.cloud.classify(imageBase64)
            logger.debug('[kiosk] 📦 Hasil classify:', {
              category: result.category,
              label: result.label,
              confidence: result.confidence,
              bbox: result.bbox,
            })

            // Track best detection for timeout fallback
            if (result.category && result.confidence > (bestDetectionRef.current?.confidence ?? 0)) {
              bestDetectionRef.current = result
              logger.debug('[kiosk] 🏆 Best detection diperbarui:', result.label, `${(result.confidence * 100).toFixed(0)}%`)
            }

            dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
            return result
          },
          (confirmed: CvDetection) => {
            logger.debug('[kiosk] ✅ Deteksi terkonfirmasi:', {
              category: confirmed.category,
              label: confirmed.label,
              confidence: confirmed.confidence,
            })
            if (scanTimeoutRef.current) {
              clearTimeout(scanTimeoutRef.current)
              scanTimeoutRef.current = null
            }
            camera.stop()
            realtimeDetection.stop()

            // item null = bank kuis tidak punya entri untuk kategori ini.
            // Pertanyaannya tetap bisa diajukan (kategorinya sudah diketahui
            // kamera) — yang hilang hanya contoh benda di layar penjelasan.
            // RESET di sini akan membuang sampah yang sudah masuk tanpa disortir.
            const item = pickItem(confirmed)
            if (!item) {
              logger.warn('[kiosk] ⚠️ Bank kuis kosong untuk kategori', confirmed.category)
            } else {
              logger.debug('[kiosk] 🎯 Quiz item dipilih:', item.item_name, `(${item.category})`)
            }
            dispatch({ type: 'SCAN_DONE', detection: confirmed, item })
          },
        )
        return
      }
      // Camera not ready yet — poll every 100ms
      setTimeout(startDetectionWhenReady, 100)
    }
    setTimeout(startDetectionWhenReady, 100)
  }, [clients, pickItem, camera, realtimeDetection])

  // --- Alur: jawab kuis ---
  const answer = useCallback(
    (choice: WasteCategory) => {
      const st = stateRef.current
      if (st.phase !== 'question') return

      // KEBENARAN tentang isi tong adalah hasil deteksi kamera — bukan kategori
      // quiz item, dan bukan pilihan anak. Servo mengikuti ini.
      const detected = st.detection?.category ?? null

      const baseLog = {
        quiz_item_id: st.item?.id ?? null,
        category_detected: detected,
        confidence: st.detection?.confidence ?? null,
        ts: new Date().toISOString(),
      }

      const { sortAs, isCorrect, outcome } = decideAnswer(detected, choice)

      // Jawaban salah: SENGAJA belum menyortir (sortAs null). Anak diberi
      // penjelasan dulu dan boleh mencoba lagi — itu inti nilai edukasinya.
      // Sampahnya tetap tersortir sesuai deteksi lewat sortir pengaman bila anak
      // keburu pergi (lihat efek auto-reset), jadi tak ada yang tertinggal di
      // tray netral.
      if (outcome === 'wrong') {
        dispatch({ type: 'ANSWER_WRONG', choice })
        playError(st.muted)
        void enqueueLog({ ...baseLog, is_correct: isCorrect })

        return
      }

      dispatch({ type: 'ANSWER_CORRECT' })
      void (async () => {
        if (sortAs !== null) await sortTrash(sortAs)
        dispatch({ type: 'SORT_DONE' })
        playSuccess(stateRef.current.muted)
        void enqueueLog({ ...baseLog, is_correct: isCorrect })
      })()
    },
    [enqueueLog, sortTrash],
  )

  const retryQuestion = useCallback(() => dispatch({ type: 'RETRY_QUESTION' }), [])
  const reset = useCallback(() => {
    camera.stop()
    realtimeDetection.stop()
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    bestDetectionRef.current = null
    sortedRef.current = false
    dispatch({ type: 'RESET' })
  }, [camera, realtimeDetection])
  const toggleMute = useCallback(() => dispatch({ type: 'TOGGLE_MUTE' }), [])

  // --- Debug Panel ---
  const forcePhase = useCallback((phase: Phase) => {
    const needsItem = phase === 'question' || phase === 'sorting' || phase === 'success' || phase === 'error'
    if (needsItem && !stateRef.current.item) {
      const item = randomFrom(quizItemsRef.current)
      if (item) {
        dispatch({
          type: 'SCAN_DONE',
          detection: { category: item.category, label: item.item_name, confidence: 0.9, bbox: null, model_version: 'debug' },
          item,
        })
      }
    }
    dispatch({ type: 'FORCE_PHASE', phase })
  }, [])

  const setNextDetection = useCallback((d: CvDetection | null) => {
    mockControls.nextDetection = d
  }, [])

  const setFill = useCallback(
    (compartment: WasteCategory, pct: number) => {
      if (config.useMock && clients.esp32 instanceof MockEsp32Client) {
        clients.esp32.setFill(compartment, pct)
      }
    },
    [clients],
  )

  const toggleEsp32Offline = useCallback(() => {
    mockControls.esp32Offline = !mockControls.esp32Offline
    dispatch({ type: 'SET_ESP32_OFFLINE', offline: mockControls.esp32Offline })
  }, [])

  const toggleCloudOffline = useCallback(() => {
    mockControls.cloudOffline = !mockControls.cloudOffline
    dispatch({ type: 'SET_CLOUD_OFFLINE', offline: mockControls.cloudOffline })
  }, [])

  const pendingLogs = useCallback(() => retryQueue.snapshot(), [retryQueue])

  const startCamera = useCallback(() => camera.start(), [camera])
  const stopCamera = useCallback(() => camera.stop(), [camera])

  const api: KioskApi = {
    state,
    liveDetection: realtimeDetection.state.liveDetection,
    isDetecting: realtimeDetection.state.isDetecting,
    insertTrash,
    answer,
    retryQuestion,
    reset,
    toggleMute,
    camera: camera.state,
    startCamera,
    stopCamera,
    forcePhase,
    setNextDetection,
    setFill,
    toggleEsp32Offline,
    toggleCloudOffline,
    pendingLogs,
  }

  return <KioskContext value={api}>{children}</KioskContext>
}
