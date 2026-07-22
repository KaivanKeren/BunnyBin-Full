// Sinkron 1:1 dengan API Resource Laravel (backend-laravel/app/Http/Resources).
// Satu file — jangan tersebar.

export type Role = 'super_admin' | 'school_admin'
export type UnitStatus = 'active' | 'maintenance' | 'offline'
export type WasteCategory = 'organic' | 'inorganic'
export type AlertType = 'fill_70' | 'fill_90' | 'offline' | 'maintenance' | 'sensor_fault'

export interface AdminUser {
  id: number
  name: string
  email: string
  role: Role
  school: { id: number; name: string } | null
}

export interface School {
  id: number
  name: string
  address: string | null
  city: string | null
  province: string | null
  contact_person: string | null
  contact_phone: string | null
  units_count?: number
}

export interface FillSnapshot {
  organic_pct: number
  inorganic_pct: number
  // Jarak mentah ultrasonik — null bila device masih mengirim persen langsung
  organic_distance_cm: number | null
  inorganic_distance_cm: number | null
  recorded_at: string
}

export interface MaintenanceEvent {
  id: number
  event_type: string
  note: string | null
  resolved: boolean
  created_at: string
}

export interface Unit {
  id: number
  code: string
  location_label: string | null
  status: UnitStatus
  last_seen_at: string | null
  installed_at: string | null
  // Geometri tong — backend memakainya untuk konversi jarak sensor → persen
  bin_height_cm: number
  sensor_offset_cm: number
  school: { id: number; name: string }
  latest_fill: FillSnapshot | null
  maintenance_events?: MaintenanceEvent[]
}

export interface FillHistoryRawPoint {
  organic_pct: number
  inorganic_pct: number
  organic_distance_cm: number | null
  inorganic_distance_cm: number | null
  recorded_at: string
}

export interface FillHistoryHourlyPoint {
  bucket: string
  avg_organic_pct: number
  avg_inorganic_pct: number
}

export interface FillHistoryResponse {
  unit_id: number
  interval: 'raw' | 'hourly'
  from: string
  to: string
  data: FillHistoryRawPoint[] | FillHistoryHourlyPoint[]
}

export interface SortLog {
  id: number
  unit_id: number
  category_detected: WasteCategory | null
  confidence: number | null
  is_correct: boolean | null
  quiz_item: { id: number; item_name: string; category: WasteCategory } | null
  unit?: { id: number; code: string }
  created_at: string
}

export interface SortLogsSummary {
  total_scored: number
  correct: number
  accuracy: number | null
}

export interface QuizItem {
  id: number
  category: WasteCategory
  item_name: string
  image_url: string | null
  explanation: string | null
  active: boolean
}

export interface Alert {
  id: number
  alert_type: AlertType
  message: string
  is_read: boolean
  created_at: string
  unit: { id: number; code: string; location_label: string | null }
}

export interface DashboardSummary {
  total_units: number
  units_online: number
  units_offline: number
  avg_organic_pct: number | null
  avg_inorganic_pct: number | null
  unread_alerts: number
  sort_accuracy_7d: number | null
}

export interface Paginated<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page: number }
}
