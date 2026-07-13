// src/components/StatusBar.tsx
// Bar atas: status online + counter bintang (in-memory per sesi, §4) + mute + reset.
// Port dari header prototype page.jsx.
import { RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { useKiosk } from '@/context/kioskContext'

export default function StatusBar() {
  const { state, toggleMute, reset } = useKiosk()
  const online = !state.esp32Offline && !state.cloudOffline

  return (
    <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-5 py-2 text-xs">
      <div className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 font-semibold text-[#6b5b50] shadow-soft">
        <span
          className={`h-2 w-2 rounded-full ${online ? 'animate-pulse bg-organic-400' : 'bg-gray-400'}`}
        />
        {online ? 'BunnyBin Online' : 'BunnyBin Mode Lokal'}
      </div>
      <div className="flex items-center gap-2">
        <div className="rounded-full bg-white/70 px-3 py-1 font-bold text-[#3a2f29] shadow-soft">
          ⭐ {state.score}
        </div>
        <button
          onClick={toggleMute}
          aria-label={state.muted ? 'Nyalakan suara' : 'Matikan suara'}
          className="rounded-full bg-white/70 p-2 text-[#6b5b50] shadow-soft transition hover:bg-white"
        >
          {state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          onClick={reset}
          aria-label="Mulai ulang"
          className="rounded-full bg-white/70 p-2 text-[#6b5b50] shadow-soft transition hover:bg-white"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}
