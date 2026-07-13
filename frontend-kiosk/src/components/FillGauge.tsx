// src/components/FillGauge.tsx
// Gauge fill dua kompartemen (organik/anorganik), dipakai di FullLock & indikator status.
import { motion } from 'framer-motion'
import type { Esp32Status } from '@/api/contracts'
import { FILL_LOCK } from '@/machine/kioskReducer'

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  const full = pct >= FILL_LOCK
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm font-semibold text-[#6b5b50]">
        <span>{label}</span>
        <span className={full ? 'text-red-500' : ''}>{Math.round(pct)}%</span>
      </div>
      <div className="h-4 w-56 overflow-hidden rounded-full bg-black/10">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: full ? '#ef4444' : color }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
        />
      </div>
    </div>
  )
}

export default function FillGauge({ fill }: { fill: Esp32Status }) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl bg-white/80 p-5 shadow-soft">
      <Bar label="Organik" pct={fill.organic_pct} color="#5cb85c" />
      <Bar label="Anorganik" pct={fill.inorganic_pct} color="#5499e6" />
    </div>
  )
}
