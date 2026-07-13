// src/screens/FullLockScreen.tsx — Bunny penuh (fill ≥90%), tolak sampah baru (§4, UI-06).
// Non-interaktif; hilang otomatis saat fill turun <90% (KioskProvider FULL_RELEASE).
import { motion } from 'framer-motion'
import { PackageOpen } from 'lucide-react'
import BunnyMascot from '@/components/BunnyMascot'
import FillGauge from '@/components/FillGauge'
import { useKiosk } from '@/context/kioskContext'

export default function FullLockScreen() {
  const { state } = useKiosk()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-5 px-10"
      style={{ background: 'linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)' }}
    >
      <BunnyMascot mood="sad" size={180} />

      <div className="flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-white shadow-pop">
        <PackageOpen size={22} />
        <h1 className="text-2xl font-bold">Bunny sudah penuh!</h1>
      </div>

      <p className="max-w-md text-center text-base text-[#6b5b50]">
        Tunggu petugas mengosongkan Bunny dulu ya. Sebentar lagi kita bisa main lagi! 🌱
      </p>

      <FillGauge fill={state.fill} />
    </motion.div>
  )
}
