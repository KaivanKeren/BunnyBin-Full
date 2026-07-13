// src/machine/kioskReducer.ts
// State machine kiosk (§3). 5 state inti dari prototype live + full_lock.
// OFFLINE dimodelkan sebagai flag overlay non-blocking (esp32Offline/cloudOffline), bukan phase.
// 'sorting' = state transisi singkat saat servo bergerak (UI-03), antara jawaban benar → success.
import type { CvDetection, Esp32Status, QuizItem, WasteCategory } from '@/api/contracts'

export type Phase =
  | 'idle'
  | 'scanning'
  | 'question'
  | 'sorting'
  | 'success'
  | 'error'
  | 'full_lock'

export interface KioskState {
  phase: Phase
  item: QuizItem | null
  detection: CvDetection | null
  wrongChoice: WasteCategory | null
  score: number
  successCount: number
  muted: boolean
  fill: Esp32Status
  esp32Offline: boolean
  cloudOffline: boolean
  queueLength: number // log sortir yang belum tersinkron (retry queue)
}

export const initialState: KioskState = {
  phase: 'idle',
  item: null,
  detection: null,
  wrongChoice: null,
  score: 0,
  successCount: 0,
  muted: false,
  fill: { organic_pct: 0, inorganic_pct: 0, servo_pos: 'idle' },
  esp32Offline: false,
  cloudOffline: false,
  queueLength: 0,
}

export type KioskAction =
  | { type: 'SCAN_START' }
  | { type: 'SCAN_DONE'; detection: CvDetection; item: QuizItem }
  | { type: 'ANSWER_CORRECT' }
  | { type: 'SORT_DONE' }
  | { type: 'ANSWER_WRONG'; choice: WasteCategory }
  | { type: 'RETRY_QUESTION' }
  | { type: 'RESET' }
  | { type: 'TOGGLE_MUTE' }
  | { type: 'FILL_UPDATE'; fill: Esp32Status }
  | { type: 'FULL_LOCK' }
  | { type: 'FULL_RELEASE' }
  | { type: 'SET_ESP32_OFFLINE'; offline: boolean }
  | { type: 'SET_CLOUD_OFFLINE'; offline: boolean }
  | { type: 'SET_QUEUE_LENGTH'; length: number }
  | { type: 'FORCE_PHASE'; phase: Phase } // Debug Panel only

export function kioskReducer(state: KioskState, action: KioskAction): KioskState {
  switch (action.type) {
    case 'SCAN_START':
      return { ...state, phase: 'scanning', item: null, detection: null, wrongChoice: null }

    case 'SCAN_DONE':
      return { ...state, phase: 'question', detection: action.detection, item: action.item }

    case 'ANSWER_CORRECT':
      return { ...state, phase: 'sorting' }

    case 'SORT_DONE':
      return {
        ...state,
        phase: 'success',
        score: state.score + 10,
        successCount: state.successCount + 1,
      }

    case 'ANSWER_WRONG':
      return { ...state, phase: 'error', wrongChoice: action.choice }

    case 'RETRY_QUESTION':
      return { ...state, phase: 'question' }

    case 'RESET':
      return { ...state, phase: 'idle', item: null, detection: null, wrongChoice: null }

    case 'TOGGLE_MUTE':
      return { ...state, muted: !state.muted }

    case 'FILL_UPDATE':
      return { ...state, fill: action.fill }

    case 'FULL_LOCK':
      // Hanya kunci dari idle — jangan interupsi anak yang sedang menjawab.
      return state.phase === 'idle' ? { ...state, phase: 'full_lock' } : state

    case 'FULL_RELEASE':
      return state.phase === 'full_lock' ? { ...state, phase: 'idle' } : state

    case 'SET_ESP32_OFFLINE':
      return { ...state, esp32Offline: action.offline }

    case 'SET_CLOUD_OFFLINE':
      return { ...state, cloudOffline: action.offline }

    case 'SET_QUEUE_LENGTH':
      return { ...state, queueLength: action.length }

    case 'FORCE_PHASE':
      return { ...state, phase: action.phase }

    default:
      return state
  }
}

// Ambang fill (UI-06)
export const FILL_WARN = 70
export const FILL_LOCK = 90

export function fillWarning(fill: Esp32Status): boolean {
  return Math.max(fill.organic_pct, fill.inorganic_pct) >= FILL_WARN
}
export function fillLocked(fill: Esp32Status): boolean {
  return Math.max(fill.organic_pct, fill.inorganic_pct) >= FILL_LOCK
}
