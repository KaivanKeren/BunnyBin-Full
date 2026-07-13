# BunnyBin Kiosk (frontend-kiosk)

UI kiosk yang berinteraksi langsung dengan anak di layar trash bin. Implementasi dari
[`docs/PRD-Frontend.md`](../docs/PRD-Frontend.md). Track independen, terpisah dari dashboard
admin (`../frontend`).

Referensi visual di-port 1:1 dari prototype Next.js `/mnt/Projects/BunnyBin`
(dan live di `bunny-bin-prototype.vercel.app`): maskot Bunny SVG, HandHint, Confetti,
palet warna organic/inorganic, dan ke-5 state.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4 (`@tailwindcss/vite`, token di `src/index.css`)
- framer-motion (animasi), lucide-react (ikon)
- axios (cloud, Sanctum token per-unit ability `kiosk` — Bearer header)

## Menjalankan

```bash
npm install
cp .env.example .env   # sudah ada .env default (mock + debug panel)
npm run dev            # http://localhost:5173
```

Perintah lain: `npm run build`, `npm run typecheck`, `npm run lint`, `npm run preview`.

## Arsitektur

```
src/
├── api/
│   ├── contracts.ts          # kontrak §5 (IEsp32Client, ICvClient, ICloudClient)
│   ├── config.ts             # baca VITE_*
│   ├── http.ts               # axios cloud (cookie session) + esp32
│   ├── index.ts              # factory mock/real (VITE_USE_MOCK)
│   ├── mock/                 # MockEsp32Client, MockCloudClient, generateDetection, mockControls
│   └── real/                 # RealEsp32Client, RealCloudClient (stub, K7/K8)
├── machine/kioskReducer.ts   # state machine (§3)
├── context/                  # KioskProvider (orchestrator) + hook
├── screens/                  # Idle, Scanning, Question, Sorting, Success, Error, FullLock, OfflineBanner
├── components/               # BunnyMascot, HandHint, Confetti, StatusBar, FillGauge, StarReward
├── lib/                      # itemEmoji, sound (Web Audio)
├── mocks/quizBank.json       # 20 item (10 organik / 10 anorganik)
└── debug/DebugPanel.tsx      # 5× tap pojok kanan atas (gated VITE_DEBUG_PANEL)
```

### Ganti mock → real

Set `VITE_USE_MOCK=false`. `RealEsp32Client`/`RealCloudClient` sudah memetakan ke endpoint
Laravel; endpoint `POST /api/units/{code}/sort-logs` masih **addendum** (`PRD-Frontend.md` §7),
perlu ditambahkan di backend (Fase K7) sebelum sinkron nyata.

## Alur state (§3)

`idle → scanning → question → (benar) sorting → success → idle`
`question → (salah) error → coba lagi → question`
Overlay non-blocking: `full_lock` (fill ≥90%), banner offline ESP32/cloud, retry queue logSort.

## Debug Panel

Aktif saat `VITE_DEBUG_PANEL=true`. 5× tap pojok kanan atas → paksa state, slider fill,
override hasil CV berikutnya, toggle offline ESP32/cloud independen, inspeksi retry queue.
Tidak pernah masuk build produksi (set `VITE_DEBUG_PANEL=false`).
