# PRD: BunnyBin Frontend — Kiosk UI (Interaksi Anak)

| | |
|---|---|
| **Fokus dokumen** | UI utama yang berinteraksi langsung dengan anak di layar trash bin. Merevisi & merekonsiliasi `PRD-Frontend-Prototype.md` (versi awal, kontrak hipotetis) dengan kontrak backend yang **sudah nyata** dari `PRD-Backend-Laravel.md` dan `PRD-CV-Service-FastAPI.md`. |
| **Status** | Draft 3.1 — referensi visual dari `bunny-bin-prototype.vercel.app` (live fetch), belum dari source code asli. **Kode kiosk belum ada di repo** (per 2026-07-13): `frontend/` yang eksis adalah dashboard admin (`frontend-admin`, lihat `PRD-Frontend-Admin.md`), bukan kiosk ini. Dokumen ini direkonsiliasi agar konvensinya konsisten dengan repo. |
| **Parent** | `PRD-Webapp-FullStack.md` (di luar scope master PRD — kiosk = track terpisah) |
| **Dependensi kontrak** | `PRD-Backend-Laravel.md` §3.5, §6; `PRD-CV-Service-FastAPI.md` §3 |
| **Target** | Claude Code — track independen, paralel dengan roadmap master |

---

## 0. Sumber Referensi & Batasan

- **Live prototype** (`https://bunny-bin-prototype.vercel.app/`) di-fetch dan terkonfirmasi: 5 state (`idle`, `scanning`, `question`, `success`, `error`), copy layar idle, status bar "BunnyBin Online", counter bintang.
- **Belum terverifikasi** (SPA client-rendered, tidak tertangkap fetch statis): desain visual maskot, palet warna, tipografi, isi layar selain idle.
- Jika direktori project lokal (`/mnt/Projects/BunnyBin`) atau screenshot diunggah ke chat, dokumen ini akan direvisi untuk pixel-fidelity. Sampai saat itu, spesifikasi visual di §5 bersifat **struktural** (apa yang harus ada), bukan preskriptif (persis piksel yang mana).
- **Status implementasi (2026-07-13):** kiosk **sudah di-scaffold** di `frontend-kiosk/` (Vite + React 19 + TS + Tailwind v4 + framer-motion + lucide + axios). Ke-5 state + `full_lock` + banner offline + retry queue + Debug Panel jalan dengan mock; visual di-port 1:1 dari prototype `/mnt/Projects/BunnyBin`. `typecheck`, `build`, `lint` hijau. Sisa: `RealCloudClient`/`RealEsp32Client` masih stub (Fase K7/K8) + endpoint `sort-logs` (§7) belum ada di backend.

---

## 1. Prinsip Inti (tetap dari versi awal)

> Mock adalah implementasi nyata dari kontrak yang sama dengan API asli — bukan sekadar data palsu.

Perbedaan dari versi awal: kontrak di dokumen ini **bukan lagi hipotetis**. `ICloudClient` dan `ICvClient` sekarang memetakan langsung ke endpoint yang sudah dispesifikasikan penuh di `PRD-Backend-Laravel.md` dan `PRD-CV-Service-FastAPI.md` — jadi begitu backend Fase 1–5 selesai, kiosk tinggal ganti `VITE_USE_MOCK=false`, tanpa negosiasi ulang bentuk data.

---

## 2. Tech Stack

| Aspek | Keputusan | Alasan |
|---|---|---|
| Build tool | Vite | SPA murni, backend terpisah |
| Framework | React 19 + TypeScript | Samakan dgn admin (`frontend/` sudah React 19, TS ~6) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first) | Sama seperti admin — konfigurasi via `@theme` di CSS, bukan `tailwind.config.js`; tema anak via design token custom |
| State management | `useReducer` + Context (MVP) → XState saat CV confidence-branching bertambah | 5 state cukup sederhana untuk MVP |
| Data fetching | **axios** via client class (pola `src/api/client.ts` admin); React Query opsional/skip | Kiosk = 1 device lokal, bukan cache multi-resource — tapi HTTP client pakai axios agar konsisten dgn admin, bukan Fetch mentah |
| Audio | Howler.js | Suara reward/feedback |
| Deploy prototype | Vercel (visual only, sudah berjalan) | Produksi nanti: served lokal di device kiosk (mini-PC/tablet), bukan Vercel |

---

## 3. State Machine

Berdasarkan 5 state terkonfirmasi di prototype live + 2 state tambahan yang direkomendasikan untuk produksi:

```
IDLE ──(sampah terdeteksi sensor / tap layar)──▶ SCANNING
SCANNING ──(CV confidence tinggi, ≥0.75)──▶ QUESTION   (opsional: skip ke servo langsung, lihat Open Question)
SCANNING ──(CV gagal/low confidence)──▶ QUESTION       (quiz manual, tanpa hint CV)
QUESTION ──(jawab benar)──▶ SUCCESS ──(3 dtk)──▶ IDLE
QUESTION ──(jawab salah)──▶ ERROR ──(5 dtk, edukasi singkat)──▶ IDLE

Tambahan direkomendasikan (belum ada di prototype live):
apapun ──(fill unit ≥ 90%, dari polling status)──▶ FULL_LOCK  (tolak sampah baru)
apapun ──(ESP32/backend tidak terjangkau)──▶ OFFLINE_BANNER   (overlay non-blocking, kiosk tetap jalan pakai quiz manual)
```

`error` di prototype live dipakai untuk "jawaban salah" (edukasi), **bukan** error teknis — penamaan ini dipertahankan, tapi kondisi error teknis (ESP32/CV/API gagal) sebaiknya punya jalur terpisah (`OFFLINE_BANNER`) supaya tidak tertukar dengan feedback edukatif ke anak.

---

## 4. Layar

| State | Konten wajib (dari live prototype) | Catatan implementasi |
|---|---|---|
| `IDLE` | Maskot Bunny + "Halo Teman! Ayo Masukkan Sampah!" + instruksi tray hijau + tombol besar "Masukkan Sampah" + status bar online + counter bintang | Trigger ke `SCANNING`: tap tombol ATAU `IEsp32Client` mendeteksi berat/objek di tray (real mode) |
| `SCANNING` | Indikator loading/animasi "sedang memindai" | Panggil `ICvClient.detect()`, timeout 5 dtk → fallback ke `QUESTION` mode manual jika CV tidak respon |
| `QUESTION` | Gambar item quiz + 2 tombol pilihan besar (organik/anorganik), target tap min 120×120px | Data dari `ICloudClient.getQuizBank()`, item dipilih random dari kategori yang relevan (hasil CV jika confidence tinggi, atau random jika fallback) |
| `SUCCESS` | Animasi reward + suara + bintang bertambah | Auto-transisi ke `IDLE` setelah 3 dtk, kirim `logSort(is_correct: true)` |
| `ERROR` (jawaban salah) | Feedback edukatif ramah anak, maks 2 kalimat, dari `quiz_item.explanation` | Auto-transisi ke `IDLE` setelah 5 dtk, kirim `logSort(is_correct: false)` |
| `FULL_LOCK` *(baru)* | Pesan "Bunny penuh, tunggu dikosongkan ya!" + non-interaktif | Muncul saat polling `IEsp32Client.getStatus()` ≥90%, hilang otomatis saat turun <90% |
| `OFFLINE_BANNER` *(baru)* | Banner kecil non-blocking di pojok, tidak menghentikan alur kuis | Anak tetap bisa main kuis walau sync ke cloud gagal — lihat §6.3 retry queue |

Star counter (`⭐ N`) — di live prototype mulai dari 0, kemungkinan reset tiap refresh. **Rekomendasi:** pertahankan in-memory per sesi (bukan localStorage/persist), karena kiosk publik yang dipakai bergantian banyak anak — counter per-anak per-sesi lebih masuk akal daripada akumulasi selamanya di satu device.

---

## 5. Kontrak Data (Direkonsiliasi dengan Backend Nyata)

```typescript
// src/api/contracts.ts

// --- ESP32 lokal (hardware di device yang sama, jaringan lokal) ---
export interface Esp32Status {
  organic_pct: number;      // 0-100, selaras nama kolom fill_snapshots
  inorganic_pct: number;
  servo_pos: 'idle' | 'organic' | 'inorganic';
}
export interface SortCommand {
  category: 'organic' | 'inorganic';
}
export interface IEsp32Client {
  getStatus(): Promise<Esp32Status>;
  sort(cmd: SortCommand): Promise<{ status: 'ok' | 'error'; servo_pos: string }>;
  simDrop(compartment: 'organic' | 'inorganic', amount: number): Promise<void>;  // mock only
  simReset(): Promise<void>;                                                     // mock only
}

// --- CV — via proxy Laravel, BUKAN langsung ke FastAPI ---
// Kontrak PERSIS sama dengan PRD-CV-Service-FastAPI.md §3 ClassifyResponse
export interface CvDetection {
  category: 'organic' | 'inorganic' | null;
  confidence: number;       // 0-1
  bbox: [number, number, number, number] | null;
  model_version: string;
}
export interface ICvClient {
  // imageBase64 diambil dari kamera device kiosk
  detect(imageBase64: string): Promise<CvDetection>;
}

// --- Cloud — endpoint Laravel nyata, PRD-Backend-Laravel.md §3 ---
export interface QuizItem {
  id: number;
  category: 'organic' | 'inorganic';
  item_name: string;
  image_url: string | null;
  explanation: string | null;
  active: boolean;
}
export interface SortLogPayload {
  quiz_item_id: number | null;
  category_detected: 'organic' | 'inorganic' | null;
  confidence: number | null;
  is_correct: boolean;
}
export interface ICloudClient {
  getQuizBank(): Promise<QuizItem[]>;      // GET /api/quiz-items
  classify(imageBase64: string): Promise<CvDetection>;  // POST /api/cv/classify
  logSort(payload: SortLogPayload): Promise<void>;      // POST /api/units/{code}/sort-logs (BARU, lihat §7)
}
```

**Perbedaan dari versi hipotetis sebelumnya:**
- `ICvClient.detect()` sekarang eksplisit menerima gambar dan dipanggil **lewat Laravel** (`/api/cv/classify`), bukan device CV lokal terpisah — sesuai keputusan arsitektur "CV service tidak pernah dipanggil langsung dari device, Laravel selalu jadi orchestrator."
- `ICloudClient.syncLogs()` (batch) diganti `logSort()` (satu event per panggilan) — lebih sederhana untuk retry queue per-item, dan cocok dengan endpoint baru yang perlu ditambahkan (§7).
- `fill_snapshots` **dihapus** dari tanggung jawab kiosk — itu sudah jadi tanggung jawab ESP32 via MQTT langsung ke Laravel (`PRD-Backend-Laravel.md` §5). Kiosk hanya *membaca* status lokal ESP32 untuk UI real-time, tidak mengirim data fill ke cloud.

---

## 6. Auth Kiosk

- **Sanctum API token per-unit, ability `kiosk`** — bukan cookie session. Backend **sudah dibangun** begini (Fase 5): `Unit` model `implements Authenticatable, HasApiTokens`; route `/api/cv/classify` pakai `auth:sanctum` dengan Unit sebagai token holder. Token bukan login interaktif — cocok untuk device kiosk unattended.
- Satu token per `unit_code`, di-generate backend `php artisan unit:token {code}` ([app/Console/Commands/IssueUnitToken.php](../backend/app/Console/Commands/IssueUnitToken.php)), disimpan di `.env` device (`VITE_KIOSK_API_TOKEN`).
- Header: `Authorization: Bearer <token>` di semua panggilan `ICloudClient` (di-set di `frontend-kiosk/src/api/http.ts`). Otorisasi per-unit ditegakkan backend: token unit A tidak bisa post ke unit B.
- Env: `VITE_API_URL` (base URL) + `VITE_KIOSK_API_TOKEN` + `VITE_UNIT_CODE`.

### 6.3 Retry Queue (offline-first)
- `logSort()` gagal (network/API down) → simpan payload ke in-memory queue (array), retry tiap 30 dtk dengan backoff.
- Queue **tidak** pakai localStorage (kiosk device shared, dan constraint arsitektur artifact — tapi ini kode produksi asli, jadi alasan sebenarnya: kesederhanaan, restart device = queue reset, dianggap acceptable loss untuk log edukasi, bukan data kritikal finansial).
- Debug Panel bisa inspeksi isi queue (§8).

---

## 7. Addendum untuk `PRD-Backend-Laravel.md`

Endpoint berikut **belum ada** di PRD backend, perlu ditambahkan sebelum integrasi real kiosk:

```
POST /api/units/{code}/sort-logs
Auth: Sanctum token ability 'kiosk' (auth:sanctum), Unit sbg token holder —
      token unit A tidak bisa post ke unit B (cek {code} == unit token)
Body: SortLogPayload (§5)
→ insert row sort_logs, unit_id resolve dari {code}
→ 201 { "id": 123 }
```

Token generator sudah ada: `php artisan unit:token {unit_code}` (Fase 5). CV `/api/cv/classify`
juga sudah `auth:sanctum`. Yang **belum** ada hanya endpoint `sort-logs` di atas.

---

## 8. Strategi Mock (tetap dari versi awal, kontrak diperbarui)

- **MockEsp32Client**: fill naik +1%/30dtk per kompartemen aktif; `sort()` delay 800–1200ms.
- **MockCvClient/MockCloudClient.classify()**: 60% confidence tinggi (0.75–0.95), 25% confidence rendah (0.4–0.65), 15% `null` — distribusi bisa dioverride dari Debug Panel.
- **MockCloudClient.getQuizBank()**: 20 item statis (`src/mocks/quizBank.json`), 10 organik/10 anorganik.
- **MockCloudClient.logSort()**: log ke console + array in-memory, inspectable dari Debug Panel.
- Switching: satu env var `VITE_USE_MOCK`, sama seperti sebelumnya.

## 9. Debug Panel

5× tap pojok kanan atas:
- Trigger paksa tiap state (termasuk `FULL_LOCK`, `OFFLINE_BANNER`)
- Slider fill organik/anorganik
- Override hasil CV berikutnya (kategori + confidence)
- Inspeksi retry queue `logSort` yang belum terkirim
- Toggle simulasi offline (ESP32 lokal / Laravel cloud, independen)

Hanya render saat `VITE_DEBUG_PANEL=true` — tidak pernah masuk build produksi.

---

## 10. Struktur Direktori

```
frontend-kiosk/
├── src/
│   ├── api/
│   │   ├── contracts.ts
│   │   ├── index.ts                # factory mock/real
│   │   ├── mock/
│   │   └── real/
│   │       ├── RealEsp32Client.ts  # HTTP ke ESP32 lokal
│   │       └── RealCloudClient.ts  # axios ke Laravel (Bearer token per-unit)
│   ├── machine/kioskReducer.ts
│   ├── screens/
│   │   ├── IdleScreen.tsx
│   │   ├── ScanningScreen.tsx
│   │   ├── QuestionScreen.tsx
│   │   ├── SuccessScreen.tsx
│   │   ├── ErrorScreen.tsx
│   │   ├── FullLockScreen.tsx
│   │   └── OfflineBanner.tsx
│   ├── components/                 # FillGauge, BunnyMascot, StarReward, ...
│   ├── mocks/quizBank.json
│   └── debug/DebugPanel.tsx
├── public/mock-images/
└── .env.example   # VITE_USE_MOCK, VITE_API_URL, VITE_KIOSK_API_TOKEN, VITE_UNIT_CODE, VITE_ESP32_BASE_URL, VITE_DEBUG_PANEL
```

---

## 11. Requirement UI

| ID | Requirement |
|---|---|
| UI-01 | Layar idle: maskot + ajakan + instruksi tray + tombol besar + status bar + counter bintang (sesuai §4) |
| UI-02 | Kuis: gambar besar + 2 tombol pilihan min 120×120px |
| UI-03 | Kirim pilihan ke `IEsp32Client.sort()`, tampilkan loading saat servo bergerak |
| UI-04 | Reward bintang + suara untuk benar; counter in-memory per sesi |
| UI-05 | Feedback edukatif ≤2 kalimat untuk salah, dari `quiz_item.explanation` |
| UI-06 | Polling `IEsp32Client.getStatus()` tiap 2 dtk; banner ≥70%, `FULL_LOCK` ≥90% |
| UI-07 | Quiz bank data-driven dari `ICloudClient.getQuizBank()` (`GET /api/quiz-items`) |
| UI-08 | Mode kiosk fullscreen, blokir gesture navigasi browser |
| UI-09 | Semua teks Bahasa Indonesia sederhana ramah anak 7–12 th |
| UI-10 | `logSort()` gagal tidak pernah mengganggu alur anak — retry queue background (§6.3) |
| UI-11 *(baru)* | `OFFLINE_BANNER` muncul non-blocking saat ESP32 lokal ATAU Laravel cloud tidak terjangkau, kuis tetap jalan mode degradasi |

---

## 12. Roadmap Implementasi (track independen dari master PRD)

| Fase | Task | Kriteria selesai | Status |
|---|---|---|---|
| K1 | Scaffold Vite+TS+Tailwind, contracts.ts §5, factory switching | `npm run dev` jalan, type-check bersih | ✅ selesai |
| K2 | Mock client (Esp32/Cv/Cloud) + quizBank.json | mock jalan (unit test vitest belum ditambah) | ✅ selesai (test menyusul) |
| K3 | kioskReducer + screen IDLE→SCANNING→QUESTION→SUCCESS/ERROR | Happy path penuh dgn mock | ✅ selesai |
| K4 | FULL_LOCK, OFFLINE_BANNER, retry queue | Semua cabang teruji via Debug Panel | ✅ selesai |
| K5 | Debug Panel lengkap | QA trigger semua skenario tanpa hardware | ✅ selesai |
| K6 | Polish visual — port 1:1 dari prototype `/mnt/Projects/BunnyBin` | Layak demo kompetisi | ✅ selesai |
| K7 | Tambah endpoint `sort-logs` (token ability `kiosk`, §7) di backend, `RealCloudClient` | Sinkron data ke dashboard admin real | ⬜ stub siap, tunggu backend |
| K8 | `RealEsp32Client` (+ CV via proxy cloud) + device fisik | Sortir end-to-end fisik | ⬜ stub siap |

K7 punya dependensi ke `PRD-Backend-Laravel.md` — beri tahu Claude Code untuk implementasi §7 addendum di repo backend sebelum mulai K7.

---

## 13. Open Questions

- Apakah alur `SCANNING`→`QUESTION` selalu tetap tampilkan kuis meski CV confidence tinggi (sesuai desain awal "quiz-first"), atau confidence tinggi harus skip kuis langsung ke sortir? Ini menentukan apakah CV murni alat bantu edukasi atau otomasi penuh — pengaruh besar ke pengalaman anak dan ke SDG framing di `PRD.md`.
- `FULL_LOCK`/`OFFLINE_BANNER` belum ada di prototype live — konfirmasi apakah ini prioritas MVP kompetisi atau boleh Fase lanjut.
- Resolusi target device final (laptop 1366×768 vs tablet 1280×800) — pengaruh ke breakpoint Tailwind, belum diputuskan sebelumnya.
- **Menunggu upload**: source code/screenshot asli untuk styling maskot, palet warna, tipografi persis, dan konten layar `question`/`success`/`error` yang belum terverifikasi.