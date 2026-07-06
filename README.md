# BunnyBin Kiosk — Prototype FE (Fase 0)

Kiosk UI BunnyBin sesuai `PRD-FE.md`: Vite + React + TypeScript + Tailwind,
berjalan **sepenuhnya dengan mock data** — tanpa ESP32, CV service, atau
Backend Cloud.

## Menjalankan

```bash
npm install
npm run dev        # buka http://localhost:5173
npm test           # Vitest (state machine + komponen)
npm run build      # typecheck + bundle produksi
```

## Debug Panel (dev only)

Tekan **Ctrl+Shift+D** di browser saat `npm run dev`:

- Slider fill level organik/anorganik (uji alert 70%/90% instan)
- Override deteksi CV: organik/anorganik 95%, confidence rendah, tidak ada objek
- Simulasi ESP32 offline → layar `DEVICE_UNREACHABLE` (UI-09)
- Paksa transisi ke state manapun

Panel ini di-guard `import.meta.env.DEV`, tidak pernah ikut build produksi.

## Swap mock → real

Komponen hanya bicara ke interface di `src/api/contracts.ts`. Titik tukar
satu-satunya: `src/api/index.ts` (env `VITE_USE_MOCK=false` mengaktifkan
`Real*Client`). Isi `realEsp32Client.ts` / `realCvClient.ts` /
`realCloudClient.ts` di Fase A/C/B tanpa menyentuh komponen atau state machine.

## Struktur

Mengikuti PRD-FE §3: `api/` (kontrak + mock/real client), `components/screens/`
(6 layar), `components/shared/`, `hooks/` (polling ESP32 500ms & CV 200ms),
`machine/` (`useReducer` — rencana migrasi XState di Fase C, lihat PRD-FE §6.1),
`data/` (bank soal statis terbundel, offline-first), `dev/` (Debug Panel),
`config/` (settings di localStorage).

Route: `/` kiosk · `/admin` placeholder (Fase B).
