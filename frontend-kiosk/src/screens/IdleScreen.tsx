// src/screens/IdleScreen.tsx — port dari prototype states/IdleState.jsx (UI-01).
import { motion } from 'framer-motion'
import { Hand, Sparkles } from 'lucide-react'
import BunnyMascot from '@/components/BunnyMascot'
import HandHint from '@/components/HandHint'
import { useKiosk } from '@/context/kioskContext'

export default function IdleScreen() {
  const { insertTrash } = useKiosk()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-3 px-8"
    >
      <motion.div
        className="absolute top-10 h-72 w-72 rounded-full bg-organic-100 opacity-60 blur-2xl"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 3, repeat: Infinity }}
      />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="z-10 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold text-organic-500 shadow-soft"
      >
        <Sparkles size={14} /> BunnyBin v1.0
      </motion.div>

      <div className="z-10 flex flex-col items-center">
        <BunnyMascot mood="idle" size={210} waving />
      </div>

      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="z-10 text-center text-4xl font-bold leading-tight text-[#3a2f29]"
      >
        Halo Teman! <span className="text-organic-500">Ayo Masukkan</span>{' '}
        <span className="text-inorganic-500">Sampah!</span>
      </motion.h1>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="z-10 flex items-center gap-4"
      >
        <HandHint size={140} />
        <div className="text-left text-sm text-[#6b5b50]">
          <div className="font-semibold text-[#3a2f29]">Cara memasukkan:</div>
          <div>Letakkan sampah ke tray hijau di depan Bunny.</div>
        </div>
      </motion.div>

      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={insertTrash}
        className="z-10 inline-flex items-center gap-3 rounded-full bg-organic-400 px-7 py-3 text-lg font-bold text-white shadow-pop transition hover:bg-organic-500"
      >
        <Hand size={20} /> Masukkan Sampah
      </motion.button>
    </motion.div>
  )
}
