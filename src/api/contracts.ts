// Kontrak data — harus persis sama dengan skema REST di PRD.md §9.1–9.2
// dan PRD-Software.md §4.2. Komponen tidak pernah tahu apakah implementasi
// di baliknya mock atau real.

export type Category = 'organic' | 'inorganic';

// --- ESP32 (PRD.md §9.1) ---
export interface Esp32Status {
  organic: number; // 0-100
  inorganic: number; // 0-100
  servo_pos: 'idle' | 'organic' | 'inorganic';
}

export interface SortRequest {
  category: Category;
}

export interface SortResponse {
  status: 'ok' | 'error';
  servo_pos: string;
}

export interface IEsp32Client {
  getStatus(): Promise<Esp32Status>;
  sort(req: SortRequest): Promise<SortResponse>;
  simDrop(compartment: Category, amount: number): Promise<void>;
  simReset(): Promise<void>;
}

// --- CV Service (PRD-Software.md §4.2) ---
export interface CvDetection {
  category: Category | null;
  confidence: number; // 0-1
  bbox: [number, number, number, number] | null;
  timestamp: string;
}

export interface ICvClient {
  detect(): Promise<CvDetection>;
}

// --- Backend Cloud (PRD.md §9.2) ---
export interface QuizItem {
  id: string;
  category: Category;
  item_name: string;
  image_url: string;
  explanation: string;
  active: boolean;
}

export interface SyncPayload {
  sort_logs: { quiz_item_id: string; is_correct: boolean; created_at: string }[];
  fill_snapshots: { organic_pct: number; inorganic_pct: number; recorded_at: string }[];
}

export interface ICloudClient {
  getQuizBank(): Promise<QuizItem[]>;
  syncLogs(unitId: string, payload: SyncPayload): Promise<void>;
}
