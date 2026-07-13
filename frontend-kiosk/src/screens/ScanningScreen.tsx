// src/screens/ScanningScreen.tsx — port dari prototype states/ScanningState.jsx.
import { motion } from 'framer-motion'
import { ScanLine } from 'lucide-react'
import BunnyMascot from '@/components/BunnyMascot'

export default function ScanningScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative flex h-full w-full flex-col items-center justify-center gap-6"
    >
      <div className="relative flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            initial={{ scale: 0.4, opacity: 0.6 }}
            animate={{ scale: 2, opacity: 0 }}
            transition={{ duration: 2, delay: i * 0.5, repeat: Infinity, ease: 'easeOut' }}
            className="absolute h-72 w-72 rounded-full border-4 border-inorganic-300"
          />
        ))}

        <motion.div
          className="absolute h-72 w-72 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, rgba(123,179,238,0.0) 0deg, rgba(123,179,238,0.45) 45deg, rgba(123,179,238,0.0) 90deg)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />

        <BunnyMascot mood="scan" size={260} />
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col items-center gap-2"
      >
        <div className="inline-flex items-center gap-2 rounded-full bg-inorganic-100 px-5 py-2 text-inorganic-500 shadow-soft">
          <ScanLine size={20} className="animate-pulse" />
          <span className="font-semibold">Memindai sampah...</span>
        </div>
        <motion.p
          className="text-2xl font-bold text-[#3a2f29]"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          Tunggu sebentar ya!
        </motion.p>

        <div className="mt-2 flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-3 w-3 rounded-full bg-inorganic-400"
              animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
