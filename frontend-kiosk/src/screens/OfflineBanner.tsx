// src/screens/OfflineBanner.tsx — banner non-blocking (§4, UI-11).
// Muncul saat ESP32 lokal ATAU Laravel cloud tak terjangkau; kuis tetap jalan (degradasi).
// Juga menampilkan info fill warning (≥70%) & antrean log belum tersinkron (§6.3).
import { AnimatePresence, motion } from 'framer-motion'
import { CloudOff, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { useKiosk } from '@/context/kioskContext'
import { fillWarning } from '@/machine/kioskReducer'

export default function OfflineBanner() {
  const { state } = useKiosk()
  const messages: { icon: ReactNode; text: string }[] = []

  if (state.esp32Offline)
    messages.push({ icon: <WifiOff size={14} />, text: 'Sensor Bunny offline — mode kuis manual' })
  if (state.cloudOffline)
    messages.push({
      icon: <CloudOff size={14} />,
      text:
        state.queueLength > 0
          ? `Cloud offline — ${state.queueLength} skor menunggu terkirim`
          : 'Cloud offline — skor disimpan sementara',
    })
  if (!state.esp32Offline && !state.cloudOffline && fillWarning(state.fill))
    messages.push({ icon: <span>⚠️</span>, text: 'Bunny hampir penuh' })

  return (
    <div className="pointer-events-none absolute bottom-12 left-3 z-40 flex flex-col gap-2">
      <AnimatePresence>
        {messages.map((m) => (
          <motion.div
            key={m.text}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex items-center gap-2 rounded-full bg-amber-100/95 px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-soft"
          >
            {m.icon}
            {m.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
