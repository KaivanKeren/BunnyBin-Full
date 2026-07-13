// src/components/Confetti.tsx
// Port 1:1 dari prototype components/Confetti.jsx.
import { motion } from 'framer-motion'
import { useMemo } from 'react'

const COLORS = ['#FFB6B6', '#86CF86', '#7BB3EE', '#FFD86B', '#C792EA']

export default function Confetti({ count = 36 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 1.6 + Math.random() * 1.4,
        rotate: Math.random() * 360,
        color: COLORS[i % COLORS.length],
        size: 8 + Math.random() * 8,
      })),
    [count],
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: ['0%', '110%'], rotate: [0, p.rotate + 360], opacity: [1, 1, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeIn' }}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            width: p.size,
            height: p.size * 0.4,
            backgroundColor: p.color,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  )
}
