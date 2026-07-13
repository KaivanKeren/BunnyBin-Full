// src/api/contracts.ts
// Kontrak data kiosk — direkonsiliasi 1:1 dengan backend nyata (PRD-Frontend.md §5).
// QuizItem & SortLog selaras dengan frontend/src/api/contracts.ts (dashboard admin) dan
// API Resource Laravel. Jangan tersebar — satu file sumber kebenaran untuk kiosk.

export type WasteCategory = 'organic' | 'inorganic'

// --- ESP32 lokal (hardware di device yang sama, jaringan lokal) ---
export interface Esp32Status {
  organic_pct: number // 0-100, selaras nama kolom fill_snapshots
  inorganic_pct: number
  servo_pos: 'idle' | 'organic' | 'inorganic'
}
export interface SortCommand {
  category: WasteCategory
}
export interface SortResult {
  status: 'ok' | 'error'
  servo_pos: string
}
export interface IEsp32Client {
  getStatus(): Promise<Esp32Status>
  sort(cmd: SortCommand): Promise<SortResult>
  simDrop(compartment: WasteCategory, amount: number): Promise<void> // mock only
  simReset(): Promise<void> // mock only
}

// --- CV — via proxy Laravel, BUKAN langsung ke FastAPI ---
// Kontrak PERSIS sama dengan PRD-CV-Service-FastAPI.md §3 ClassifyResponse
export interface CvDetection {
  category: WasteCategory | null
  confidence: number // 0-1
  bbox: [number, number, number, number] | null
  model_version: string
}
export interface ICvClient {
  // imageBase64 diambil dari kamera device kiosk
  detect(imageBase64: string): Promise<CvDetection>
}

// --- Cloud — endpoint Laravel nyata, PRD-Backend-Laravel.md §3 ---
export interface QuizItem {
  id: number
  category: WasteCategory
  item_name: string
  image_url: string | null
  explanation: string | null
  active: boolean
}
export interface SortLogPayload {
  quiz_item_id: number | null
  category_detected: WasteCategory | null
  confidence: number | null
  is_correct: boolean
}
export interface ICloudClient {
  getQuizBank(): Promise<QuizItem[]> // GET /api/quiz-items
  classify(imageBase64: string): Promise<CvDetection> // POST /api/cv/classify
  logSort(payload: SortLogPayload): Promise<void> // POST /api/units/{code}/sort-logs (§7)
}
