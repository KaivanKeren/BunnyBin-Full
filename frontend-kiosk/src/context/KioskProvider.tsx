// src/context/KioskProvider.tsx
// Orchestrator kiosk: state machine + client contracts + polling ESP32 + retry queue.
// "Laravel selalu orchestrator" → alur CV lewat cloud.classify() (§5).
import { useCallback, useEffect, useReducer, useRef } from 'react'
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
import { MockEsp32Client } from '@/api/mock/MockEsp32Client'
import { mockControls } from '@/api/mock/mockControls'
import { playClick, playError, playSuccess } from '@/lib/sound'
import {
  fillLocked,
  initialState,
  kioskReducer,
  type Phase,
} from '@/machine/kioskReducer'
import quizBankRaw from '@/mocks/quizBank.json'
import { KioskContext, type KioskApi } from './kioskContext'

const SCAN_TIMEOUT_MS = 5000 // §4: CV tak respon → fallback kuis manual
const SUCCESS_MS = 5000 // auto reset success → idle
const ERROR_AUTO_MS = 9000 // fallback reset error → idle bila anak pergi
const POLL_MS = 2000 // UI-06: polling fill tiap 2 dtk
const RETRY_MS = 30000 // §6.3: retry queue tiap 30 dtk
const HIGH_CONFIDENCE = 0.75 // §3

const fallbackBank = quizBankRaw as unknown as QuizItem[]

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
}

// Kamera device kiosk. Mock mengabaikan isi; real akan meng-capture frame → base64.
async function captureImage(): Promise<string> {
  return ''
}

function randomFrom<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null
}

/**
 * Kirim jarak mentah kalau firmware punya, DAN JANGAN sertakan persen di kasus
 * itu: backend memang mengabaikan persen saat ada jarak, tapi validatornya
 * menuntut persen berupa bilangan bulat — firmware yang melaporkan 50.5%
 * akan membuat seluruh relay ditolak 422 padahal jaraknya sempurna.
 */
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

/**
 * Angka mana yang ditampilkan ke anak.
 *
 * Kalau firmware mengirim jarak mentah, persen bawaannya dihitung dari geometri
 * yang di-hardcode di firmware, sedangkan dashboard admin memakai geometri yang
 * bisa dikalibrasi dari web. Dua sumber → dua angka berbeda untuk satu tong.
 * Maka persen dari backend yang menang begitu relay pertama berhasil.
 *
 * Kalau firmware hanya punya persen (atau cloud belum pernah menjawab), persen
 * ESP32 dipakai apa adanya — kiosk harus tetap jalan tanpa jaringan.
 */
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

  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const quizItemsRef = useRef<QuizItem[]>(fallbackBank)
  const retryQueueRef = useRef<SortLogPayload[]>([])
  // Pembacaan ESP32 terakhir, dipakai relay periodik ke cloud.
  const lastStatusRef = useRef<Esp32Status | null>(null)
  // Persen versi backend dari relay terakhir — lihat displayFill().
  const cloudFillRef = useRef<Pick<Esp32Status, 'organic_pct' | 'inorganic_pct'> | null>(null)

  const setQueueLength = useCallback(() => {
    dispatch({ type: 'SET_QUEUE_LENGTH', length: retryQueueRef.current.length })
  }, [])

  // Satu jalur untuk semua pembaruan fill supaya kunci "penuh" selalu dinilai
  // dari angka yang sama dengan yang tampil di layar.
  const applyFill = useCallback((status: Esp32Status) => {
    const fill = displayFill(status, cloudFillRef.current)
    dispatch({ type: 'FILL_UPDATE', fill })
    if (fillLocked(fill)) dispatch({ type: 'FULL_LOCK' })
    else dispatch({ type: 'FULL_RELEASE' })
  }, [])

  // --- Muat quiz bank sekali; fallback ke bundle bila cloud gagal (degradasi) ---
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

  // --- Polling status ESP32 (fill + full_lock + offline banner lokal) ---
  // POLL_MS adalah JEDA ANTAR pembacaan, bukan irama tetap: pembacaan berikutnya
  // baru dijadwalkan setelah yang sekarang selesai. WebServer di ESP32 melayani
  // satu klien pada satu waktu, jadi dengan setInterval — di WiFi lambat yang
  // sesekali butuh >2 detik — permintaan menumpuk, saling antre di ESP32, dan
  // memperparah keterlambatan yang jadi penyebabnya.
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

  // --- Relay ESP32 → Laravel: inilah yang membuat dashboard admin melihat
  // unit yang sama dengan yang dilihat anak di kiosk. Backend mengembalikan
  // persen versi dirinya dan kiosk mengadopsinya, jadi tidak mungkin ada dua
  // angka berbeda untuk satu tong. Tanpa status ESP32 (sensor mati) kiosk tetap
  // kirim heartbeat — kiosknya hidup, sensornya yang tidak.
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
        // Ditolak (mis. jarak di luar rentang) = cloud tetap terjangkau; yang
        // salah pembacaannya, dan backend sudah memunculkan alert sensor.
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

  // --- Retry queue logSort (§6.3) ---
  useEffect(() => {
    const id = setInterval(async () => {
      const queue = retryQueueRef.current
      if (!queue.length) return
      while (queue.length) {
        try {
          await clients.cloud.logSort(queue[0])
          queue.shift()
        } catch (err) {
          if (err instanceof CloudRejectedError) {
            // Payload ini tidak akan pernah diterima — buang, jangan biarkan
            // ia menghalangi log-log sesudahnya selamanya.
            console.warn('[kiosk] log sortiran ditolak server, dibuang:', err.message, queue[0])
            queue.shift()
            continue
          }
          break // masih offline, coba lagi 30 dtk berikutnya
        }
      }
      if (!queue.length) dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      setQueueLength()
    }, RETRY_MS)
    return () => clearInterval(id)
  }, [clients, setQueueLength])

  // --- Auto-reset success / error ---
  useEffect(() => {
    if (state.phase === 'success') {
      const t = setTimeout(() => dispatch({ type: 'RESET' }), SUCCESS_MS)
      return () => clearTimeout(t)
    }
    if (state.phase === 'error') {
      const t = setTimeout(() => dispatch({ type: 'RESET' }), ERROR_AUTO_MS)
      return () => clearTimeout(t)
    }
  }, [state.phase])

  const enqueueLog = useCallback(
    async (payload: SortLogPayload) => {
      try {
        await clients.cloud.logSort(payload)
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      } catch (err) {
        if (err instanceof CloudRejectedError) {
          console.warn('[kiosk] log sortiran ditolak server:', err.message, payload)
          return // permanen — antre pun percuma
        }
        retryQueueRef.current.push(payload)
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: true })
        setQueueLength()
      }
    },
    [clients, setQueueLength],
  )

  const pickItem = useCallback((detection: CvDetection): QuizItem | null => {
    const bank = quizItemsRef.current
    if (detection.category && detection.confidence >= HIGH_CONFIDENCE) {
      const scoped = bank.filter((q) => q.category === detection.category)
      const pick = randomFrom(scoped)
      if (pick) return pick
    }
    return randomFrom(bank)
  }, [])

  // --- Alur: masukkan sampah → scan → question ---
  const insertTrash = useCallback(() => {
    if (stateRef.current.phase !== 'idle') return
    playClick(stateRef.current.muted)
    dispatch({ type: 'SCAN_START' })
    void (async () => {
      const image = await captureImage()
      let detection: CvDetection
      try {
        detection = await withTimeout(clients.cloud.classify(image), SCAN_TIMEOUT_MS)
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: false })
      } catch {
        // CV gagal/timeout → kuis manual tanpa hint (§3)
        detection = { category: null, confidence: 0, bbox: null, model_version: 'offline' }
        dispatch({ type: 'SET_CLOUD_OFFLINE', offline: true })
      }
      const item = pickItem(detection)
      if (!item) {
        dispatch({ type: 'RESET' })
        return
      }
      dispatch({ type: 'SCAN_DONE', detection, item })
    })()
  }, [clients, pickItem])

  // --- Alur: jawab kuis ---
  const answer = useCallback(
    (choice: WasteCategory) => {
      const st = stateRef.current
      const item = st.item
      if (!item || st.phase !== 'question') return
      const detectedLog = {
        quiz_item_id: item.id,
        category_detected: st.detection?.category ?? null,
        confidence: st.detection?.confidence ?? null,
        // Waktu anak menjawab, bukan waktu berhasil terkirim — kalau cloud
        // sempat putus, urutan di dashboard admin tetap benar.
        ts: new Date().toISOString(),
      }

      if (choice === item.category) {
        dispatch({ type: 'ANSWER_CORRECT' }) // → sorting (servo bergerak)
        void (async () => {
          try {
            await clients.esp32.sort({ category: item.category })
            dispatch({ type: 'SET_ESP32_OFFLINE', offline: false })
          } catch {
            dispatch({ type: 'SET_ESP32_OFFLINE', offline: true }) // tetap lanjut (degradasi)
          }
          dispatch({ type: 'SORT_DONE' }) // → success
          playSuccess(stateRef.current.muted)
          void enqueueLog({ ...detectedLog, is_correct: true })
        })()
      } else {
        dispatch({ type: 'ANSWER_WRONG', choice })
        playError(st.muted)
        void enqueueLog({ ...detectedLog, is_correct: false })
      }
    },
    [clients, enqueueLog],
  )

  const retryQuestion = useCallback(() => dispatch({ type: 'RETRY_QUESTION' }), [])
  const reset = useCallback(() => dispatch({ type: 'RESET' }), [])
  const toggleMute = useCallback(() => dispatch({ type: 'TOGGLE_MUTE' }), [])

  // --- Debug Panel (§9) ---
  const forcePhase = useCallback((phase: Phase) => {
    const needsItem = phase === 'question' || phase === 'sorting' || phase === 'success' || phase === 'error'
    if (needsItem && !stateRef.current.item) {
      const item = randomFrom(quizItemsRef.current)
      if (item) {
        dispatch({
          type: 'SCAN_DONE',
          detection: { category: item.category, confidence: 0.9, bbox: null, model_version: 'debug' },
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

  const pendingLogs = useCallback(() => [...retryQueueRef.current], [])

  const api: KioskApi = {
    state,
    insertTrash,
    answer,
    retryQuestion,
    reset,
    toggleMute,
    forcePhase,
    setNextDetection,
    setFill,
    toggleEsp32Offline,
    toggleCloudOffline,
    pendingLogs,
  }

  return <KioskContext value={api}>{children}</KioskContext>
}
