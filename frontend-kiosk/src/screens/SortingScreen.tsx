// src/screens/SortingScreen.tsx — loader singkat saat servo bergerak (UI-03).
// Bukan bagian 5-state prototype; transisi jawaban benar → success.
import { motion } from 'framer-motion'
import { Cog } from 'lucide-react'
import BunnyMascot from '@/components/BunnyMascot'
import { useKiosk } from '@/context/kioskContext'

export default function SortingScreen() {
  const { state } = useKiosk()
  const isOrganic = state.item?.category === 'organic'
  const color = isOrganic ? 'text-organic-500' : 'text-inorganic-500'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-6"
    >
      <BunnyMascot mood="happy" size={200} />
      <div className="flex flex-col items-center gap-3">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
          <Cog className={color} size={40} />
        </motion.div>
        <p className="text-2xl font-bold text-[#3a2f29]">Bunny sedang memilah...</p>
        <p className="text-sm text-[#6b5b50]">
          Sampah masuk ke laci {isOrganic ? 'organik' : 'anorganik'} ya!
        </p>
      </div>
    </motion.div>
  )
}
