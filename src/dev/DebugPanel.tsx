// Panel khusus development (PRD-FE §5.5) — hanya dirender di balik guard
// `import.meta.env.DEV`, tidak pernah ikut ke build produksi.

import { useState } from 'react';
import type { Dispatch } from 'react';
import { cvClient, esp32Client } from '../api';
import { MockEsp32Client } from '../api/esp32/mockEsp32Client';
import { MockCvClient } from '../api/cv/mockCvClient';
import type { BunnyState, MachineContext, MachineEvent } from '../machine/bunnyBinMachine';

const FORCE_STATES: BunnyState[] = [
  'IDLE',
  'SCANNING',
  'QUESTION',
  'SUCCESS',
  'ERROR',
  'DEVICE_UNREACHABLE',
];

type CvPreset = 'random' | 'organic' | 'inorganic' | 'low' | 'none';

const CV_PRESETS: { key: CvPreset; label: string }[] = [
  { key: 'random', label: 'Acak (default)' },
  { key: 'organic', label: 'Organik 95%' },
  { key: 'inorganic', label: 'Anorganik 95%' },
  { key: 'low', label: 'Confidence rendah 40%' },
  { key: 'none', label: 'Tidak ada objek' },
];

interface DebugPanelProps {
  ctx: MachineContext;
  dispatch: Dispatch<MachineEvent>;
}

export function DebugPanel({ ctx, dispatch }: DebugPanelProps) {
  const mockEsp32 = esp32Client instanceof MockEsp32Client ? esp32Client : null;
  const mockCv = cvClient instanceof MockCvClient ? cvClient : null;

  const [organic, setOrganic] = useState(20);
  const [inorganic, setInorganic] = useState(35);
  const [offline, setOffline] = useState(mockEsp32?.offline ?? false);
  const [cvPreset, setCvPreset] = useState<CvPreset>('random');

  const applyLevels = (nextOrganic: number, nextInorganic: number) => {
    setOrganic(nextOrganic);
    setInorganic(nextInorganic);
    mockEsp32?.simSetLevels(nextOrganic, nextInorganic);
  };

  const applyCvPreset = (preset: CvPreset) => {
    setCvPreset(preset);
    if (!mockCv) return;
    switch (preset) {
      case 'random':
        mockCv.override = null;
        break;
      case 'organic':
        mockCv.override = { category: 'organic', confidence: 0.95 };
        break;
      case 'inorganic':
        mockCv.override = { category: 'inorganic', confidence: 0.95 };
        break;
      case 'low':
        mockCv.override = { category: 'organic', confidence: 0.4 };
        break;
      case 'none':
        mockCv.override = { category: null, confidence: 0 };
        break;
    }
  };

  const toggleOffline = (next: boolean) => {
    setOffline(next);
    if (mockEsp32) mockEsp32.offline = next;
  };

  return (
    <aside className="absolute top-0 right-0 bottom-0 z-50 w-80 overflow-y-auto bg-slate-900/95 p-4 font-mono text-xs text-slate-200 shadow-2xl">
      <h2 className="mb-3 text-sm font-bold text-lime-400">🛠 Debug Panel (dev only)</h2>

      <section className="mb-4">
        <h3 className="mb-1 font-bold text-sky-300">State machine</h3>
        <p className="mb-2">
          Sekarang: <span className="font-bold text-amber-300">{ctx.state}</span>
          {ctx.mode === 'cv' && ctx.state === 'QUESTION' && ' (mode CV)'}
        </p>
        <div className="flex flex-wrap gap-1">
          {FORCE_STATES.map((state) => (
            <button
              key={state}
              type="button"
              onClick={() => dispatch({ type: 'FORCE', state })}
              className={`rounded px-2 py-1 ${
                ctx.state === state ? 'bg-lime-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600'
              }`}
            >
              {state}
            </button>
          ))}
        </div>
      </section>

      {mockEsp32 && (
        <section className="mb-4">
          <h3 className="mb-1 font-bold text-sky-300">Mock ESP32 — fill level</h3>
          <label className="mb-2 block">
            Organik: {organic}%
            <input
              type="range"
              min={0}
              max={100}
              value={organic}
              onChange={(e) => applyLevels(Number(e.target.value), inorganic)}
              className="w-full accent-emerald-400"
            />
          </label>
          <label className="mb-2 block">
            Anorganik: {inorganic}%
            <input
              type="range"
              min={0}
              max={100}
              value={inorganic}
              onChange={(e) => applyLevels(organic, Number(e.target.value))}
              className="w-full accent-sky-400"
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={offline}
              onChange={(e) => toggleOffline(e.target.checked)}
            />
            Simulasi ESP32 offline (UI-09)
          </label>
        </section>
      )}

      {mockCv && (
        <section className="mb-4">
          <h3 className="mb-1 font-bold text-sky-300">Mock CV — override deteksi</h3>
          <div className="flex flex-col gap-1">
            {CV_PRESETS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => applyCvPreset(key)}
                className={`rounded px-2 py-1 text-left ${
                  cvPreset === key ? 'bg-lime-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-1 font-bold text-sky-300">Lainnya</h3>
        <button
          type="button"
          onClick={() => dispatch({ type: 'RESET_STARS' })}
          className="rounded bg-slate-700 px-2 py-1 hover:bg-slate-600"
        >
          Reset bintang ({ctx.stars})
        </button>
      </section>

      <p className="mt-4 text-slate-500">Ctrl+Shift+D untuk sembunyikan</p>
    </aside>
  );
}
