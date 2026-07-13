// src/components/StarReward.tsx
// Deretan bintang reward beranimasi (UI-04). Dipakai di SuccessScreen.
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

export default function StarReward({ count = 3, size = 28 }: { count?: number; size?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.5 + i * 0.12, type: 'spring' }}
        >
          <Star className="fill-yellow-400 text-yellow-400" size={size} />
        </motion.div>
      ))}
    </div>
  )
}
