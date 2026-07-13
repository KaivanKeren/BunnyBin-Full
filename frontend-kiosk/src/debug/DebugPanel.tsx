// src/debug/DebugPanel.tsx — QA tanpa hardware (§9).
// Buka: 5× tap pojok kanan atas. Hanya dirender saat VITE_DEBUG_PANEL=true (lihat App.tsx).
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { WasteCategory } from '@/api/contracts'
import { config } from '@/api/config'
import { useKiosk } from '@/context/kioskContext'
import type { Phase } from '@/machine/kioskReducer'

const PHASES: Phase[] = ['idle', 'scanning', 'question', 'sorting', 'success', 'error', 'full_lock']

export default function DebugPanel() {
  const kiosk = useKiosk()
  const { state } = kiosk
  const [open, setOpen] = useState(false)
  const [taps, setTaps] = useState(0)
  const [cvCat, setCvCat] = useState<WasteCategory | 'null'>('organic')
  const [cvConf, setCvConf] = useState(0.9)

  const onHotspot = () => {
    const next = taps + 1
    setTaps(next)
    if (next >= 5) {
      setOpen(true)
      setTaps(0)
    }
    setTimeout(() => setTaps(0), 1500)
  }

  const applyCvOverride = () => {
    kiosk.setNextDetection({
      category: cvCat === 'null' ? null : cvCat,
      confidence: cvConf,
      bbox: null,
      model_version: 'debug',
    })
  }

  return (
    <>
      {/* Hotspot 5-tap */}
      <button
        aria-hidden
        onClick={onHotspot}
        className="absolute right-0 top-0 z-50 h-14 w-14 opacity-0"
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            className="absolute right-0 top-0 z-50 flex h-full w-80 flex-col gap-4 overflow-y-auto bg-[#1a1410]/95 p-4 text-xs text-white shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold">🐞 Debug Panel</span>
              <button onClick={() => setOpen(false)} className="rounded-full bg-white/10 p-1">
                <X size={16} />
              </button>
            </div>

            <Section title="Paksa State">
              <div className="grid grid-cols-2 gap-1">
                {PHASES.map((p) => (
                  <button
                    key={p}
                    onClick={() => kiosk.forcePhase(p)}
                    className={`rounded px-2 py-1 font-semibold uppercase ${
                      state.phase === p ? 'bg-white text-black' : 'bg-white/15 hover:bg-white/25'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </Section>

            <Section title={`Fill Organik — ${Math.round(state.fill.organic_pct)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={state.fill.organic_pct}
                onChange={(e) => kiosk.setFill('organic', Number(e.target.value))}
                className="w-full"
                disabled={!config.useMock}
              />
            </Section>
            <Section title={`Fill Anorganik — ${Math.round(state.fill.inorganic_pct)}%`}>
              <input
                type="range"
                min={0}
                max={100}
                value={state.fill.inorganic_pct}
                onChange={(e) => kiosk.setFill('inorganic', Number(e.target.value))}
                className="w-full"
                disabled={!config.useMock}
              />
            </Section>

            <Section title="Override Hasil CV Berikutnya">
              <div className="flex gap-1">
                {(['organic', 'inorganic', 'null'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCvCat(c)}
                    className={`flex-1 rounded px-2 py-1 ${cvCat === c ? 'bg-white text-black' : 'bg-white/15'}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <label className="mt-2 block">Confidence: {cvConf.toFixed(2)}</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={cvConf}
                onChange={(e) => setCvConf(Number(e.target.value))}
                className="w-full"
              />
              <button
                onClick={applyCvOverride}
                className="mt-1 w-full rounded bg-inorganic-400 px-2 py-1 font-semibold"
                disabled={!config.useMock}
              >
                Set (one-shot)
              </button>
            </Section>

            <Section title="Simulasi Offline">
              <div className="flex gap-2">
                <Toggle label="ESP32" on={state.esp32Offline} onClick={kiosk.toggleEsp32Offline} />
                <Toggle label="Cloud" on={state.cloudOffline} onClick={kiosk.toggleCloudOffline} />
              </div>
            </Section>

            <Section title={`Retry Queue logSort (${state.queueLength})`}>
              <pre className="max-h-32 overflow-auto rounded bg-black/40 p-2 text-[10px] leading-tight">
                {kiosk.pendingLogs().length
                  ? JSON.stringify(kiosk.pendingLogs(), null, 1)
                  : 'kosong — semua tersinkron'}
              </pre>
            </Section>

            {!config.useMock && (
              <p className="text-amber-300">Mode real: slider/override CV mock dinonaktifkan.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-white/10 pt-2">
      <div className="font-semibold text-white/70">{title}</div>
      {children}
    </div>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded px-2 py-1 font-semibold ${on ? 'bg-red-500' : 'bg-white/15'}`}
    >
      {label}: {on ? 'OFF' : 'ON'}
    </button>
  )
}
