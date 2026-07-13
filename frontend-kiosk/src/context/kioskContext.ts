// src/context/kioskContext.ts
// Context + hook dipisah dari komponen Provider agar fast-refresh bersih.
import { createContext, useContext } from 'react'
import type { CvDetection, SortLogPayload, WasteCategory } from '@/api/contracts'
import type { KioskState, Phase } from '@/machine/kioskReducer'

export interface KioskApi {
  state: KioskState
  // Alur anak
  insertTrash: () => void
  answer: (choice: WasteCategory) => void
  retryQuestion: () => void
  reset: () => void
  toggleMute: () => void
  // Debug Panel (§9)
  forcePhase: (phase: Phase) => void
  setNextDetection: (d: CvDetection | null) => void
  setFill: (compartment: WasteCategory, pct: number) => void
  toggleEsp32Offline: () => void
  toggleCloudOffline: () => void
  pendingLogs: () => SortLogPayload[]
}

export const KioskContext = createContext<KioskApi | null>(null)

export function useKiosk(): KioskApi {
  const ctx = useContext(KioskContext)
  if (!ctx) throw new Error('useKiosk harus dipakai di dalam <KioskProvider>')
  return ctx
}
