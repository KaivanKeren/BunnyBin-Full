# PRD: BunnyBin Frontend — Admin Dashboard (React + TypeScript)

| | |
|---|---|
| **Fokus dokumen** | Web dashboard untuk super_admin & school_admin: monitoring bin, log sortir, quiz bank, alert. |
| **Parent** | `PRD-Webapp-FullStack.md` §10 |
| **Dependensi** | `PRD-Backend-Laravel.md` (semua endpoint), berbeda dari `PRD-Frontend-Prototype.md` (kiosk UI — repo/aplikasi terpisah) |
| **Target** | Claude Code — Fase 6–7 roadmap master PRD |

---

## 1. Stack & Setup

```bash
npm create vite@latest frontend-admin -- --template react-ts
npm i @tanstack/react-query axios react-router-dom recharts
npm i -D tailwindcss @tailwindcss/vite
```

| Concern | Pilihan | Catatan |
|---|---|---|
| Data fetching | TanStack Query v5 | caching, polling, invalidation |
| HTTP | axios instance + `withCredentials: true` | Sanctum cookie-based SPA auth |
| Routing | react-router-dom v6 | protected route via `AuthGuard` |
| Chart | recharts | line chart fill history |
| Styling | Tailwind CSS | tanpa component library berat; komponen kecil ditulis sendiri |
| State global | Tidak perlu Redux/Zustand | server state = React Query; auth state = satu context kecil |

**Kenapa bukan mock-first seperti kiosk:** dashboard ini dibangun di Fase 6, saat backend sudah hidup (Fase 1–5 selesai) — langsung konsumsi API asli, tidak perlu lapisan mock.

---

## 2. Auth Flow (Sanctum SPA)

```ts
// src/api/client.ts
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,   // http://localhost/api
  withCredentials: true,
  headers: { Accept: 'application/json' },
});
```
1. Sebelum login: `GET /sanctum/csrf-cookie`.
2. `POST /api/auth/login` → cookie session terset.
3. `AuthProvider` fetch `GET /api/auth/me` saat mount; 401 → redirect `/login`.
4. Interceptor axios: response 401 di halaman selain login → clear state + redirect.

```ts
// src/auth/AuthContext.tsx
interface AuthState {
  user: AdminUser | null;
  isSuperAdmin: boolean;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}
```

---

## 3. Kontrak TypeScript

Sinkron 1:1 dengan API Resource Laravel — satu file, jangan tersebar:

```ts
// src/api/contracts.ts
export type Role = 'super_admin' | 'school_admin';
export type UnitStatus = 'active' | 'maintenance' | 'offline';
export type WasteCategory = 'organic' | 'inorganic';
export type AlertType = 'fill_70' | 'fill_90' | 'offline' | 'maintenance';

export interface AdminUser {
  id: number; name: string; email: string; role: Role;
  school: { id: number; name: string } | null;
}

export interface School {
  id: number; name: string; address: string | null;
  city: string | null; province: string | null;
  contact_person: string | null; contact_phone: string | null;
}

export interface Unit {
  id: number; code: string; location_label: string | null;
  status: UnitStatus; last_seen_at: string | null;
  school: { id: number; name: string };
  latest_fill: FillSnapshot | null;
}

export interface FillSnapshot {
  organic_pct: number; inorganic_pct: number; recorded_at: string;
}

export interface FillHistoryPoint {
  bucket: string; avg_organic: number; avg_inorganic: number;
}

export interface SortLog {
  id: number; category_detected: WasteCategory | null;
  confidence: number | null; is_correct: boolean | null;
  quiz_item: { id: number; item_name: string } | null;
  created_at: string;
}

export interface QuizItem {
  id: number; category: WasteCategory; item_name: string;
  image_url: string | null; explanation: string | null; active: boolean;
}

export interface Alert {
  id: number; alert_type: AlertType; message: string;
  is_read: boolean; created_at: string;
  unit: { id: number; code: string };
}

export interface DashboardSummary {
  total_units: number; units_online: number; units_offline: number;
  avg_organic_pct: number; avg_inorganic_pct: number;
  unread_alerts: number; sort_accuracy_7d: number | null;
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
}
```

---

## 4. Query Hooks

```ts
// src/api/hooks.ts — satu hook per resource, key konsisten
useDashboardSummary()   // ['dashboard'], refetchInterval: 30_000
useUnits()              // ['units'],     refetchInterval: 30_000
useUnit(id)             // ['units', id]
useFillHistory(id, range, interval)  // ['units', id, 'fill', range, interval]
useSortLogs(id, filters, page)
useAlerts(unreadOnly, page)          // refetchInterval: 30_000
useQuizItems()
useSchools()            // super_admin only
// Mutations: useMarkAlertRead, useCreateQuizItem, useUpdateUnit, dst.
// Setiap mutation: invalidateQueries key terkait.
```
Polling 30 detik untuk data status — cukup real-time untuk kasus ini, tanpa WebSocket (keputusan master PRD §10).

---

## 5. Routing & Halaman

```
/login
/                      → DashboardOverview
/units/:id             → UnitDetail
/sort-logs             → SortLogs
/alerts                → Alerts
/quiz                  → QuizManagement        (guard super_admin)
/management            → SchoolUnitManagement  (guard super_admin)
```
`AuthGuard` membungkus semua kecuali `/login`; `RoleGuard` untuk 2 route terakhir — school_admin diarahkan ke `/` (menu-nya juga disembunyikan dari sidebar).

### 5.1 DashboardOverview
- Baris kartu ringkasan dari `useDashboardSummary` (unit aktif, offline, alert unread, akurasi 7d).
- Grid `UnitCard`: kode + lokasi, dua progress bar (organic/inorganic) dengan warna threshold — hijau <70, kuning 70–89, merah ≥90 — badge status, relative time `last_seen_at`. Klik → `/units/:id`.
- Panel "Alert Terbaru" (5 teratas, unread bold).

### 5.2 UnitDetail
- Header: kode, sekolah, lokasi, status, tombol ubah status (super_admin).
- **Chart fill history** (recharts `LineChart`, dua garis organic/inorganic): pemilih range `24 jam (raw) | 7 hari (hourly) | 30 hari (hourly)` → parameter endpoint `fill-history`.
- Tabel sort log unit tsb (paginated) + daftar maintenance event.

### 5.3 SortLogs
Tabel lintas unit: filter unit, tanggal (from/to), is_correct. Kolom: waktu, unit, item quiz, kategori terdeteksi, confidence (progress kecil), benar/salah. Ringkasan akurasi periode terfilter di atas tabel.

### 5.4 Alerts
Inbox: tab "Belum dibaca" / "Semua". Tiap baris ikon per `alert_type`, klik → mark read (optimistic update) + link ke unit.

### 5.5 QuizManagement (super_admin)
Tabel + modal create/edit: `item_name`, `category` (radio), `image_url` (input URL, preview), `explanation`, toggle `active`. Hapus dengan konfirmasi.

### 5.6 SchoolUnitManagement (super_admin)
Dua tab: Schools (CRUD) dan Units (CRUD, pilih sekolah via select, generate/isi `code`).

---

## 6. Komponen Bersama

```
components/
├── layout/AppShell.tsx        # sidebar + topbar (nama user, logout)
├── StatusBadge.tsx            # active/maintenance/offline
├── FillBar.tsx                # progress bar + warna threshold
├── DataTable.tsx              # tabel generic + pagination (meta Laravel)
├── ConfirmDialog.tsx
├── EmptyState.tsx / ErrorState.tsx / Spinner.tsx
└── RelativeTime.tsx           # "3 menit lalu", Intl.RelativeTimeFormat, id-ID
```
Semua tanggal ditampilkan zona `Asia/Jakarta`, format id-ID.

---

## 7. Definisi Selesai

- Login school_admin: hanya melihat unit sekolahnya, menu Quiz/Management tidak tampil, akses paksa URL → redirect.
- Login super_admin: seluruh CRUD berjalan end-to-end terhadap API asli.
- Publish MQTT dummy (`mosquitto_pub` fill 95%) → dalam ≤30 detik kartu unit jadi merah dan alert muncul tanpa refresh manual.
- `npm run build` bersih tanpa error TypeScript; bundle disajikan Nginx (lihat `PRD-Infrastructure-Deployment.md`).
