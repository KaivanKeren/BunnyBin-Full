// src/components/BunnyMascot.tsx
// Port 1:1 dari prototype components/Bunny.jsx (/mnt/Projects/BunnyBin).
import { motion } from 'framer-motion'

export type BunnyMood = 'idle' | 'scan' | 'think' | 'happy' | 'sad'

interface Props {
  mood?: BunnyMood
  size?: number
  waving?: boolean
}

const MOODS: Record<BunnyMood, { ry: number; mouth: string }> = {
  idle: { ry: 9, mouth: 'M118 152 q12 8 24 0' },
  scan: { ry: 9, mouth: 'M118 152 q12 6 24 0' },
  think: { ry: 9, mouth: 'M122 154 q8 -4 16 0' },
  happy: { ry: 4, mouth: 'M114 148 q16 16 32 0' },
  sad: { ry: 8, mouth: 'M118 158 q12 -10 24 0' },
}

export default function BunnyMascot({ mood = 'idle', size = 260, waving = false }: Props) {
  const cfg = MOODS[mood] ?? MOODS.idle

  return (
    <motion.div
      animate={waving ? { rotate: [0, -4, 4, -4, 0] } : { y: [0, -6, 0] }}
      transition={
        waving
          ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 3, repeat: Infinity, ease: 'easeInOut' }
      }
      style={{ width: size, height: size }}
      className="no-select"
    >
      <svg viewBox="0 0 260 260" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="130" cy="240" rx="70" ry="8" fill="#000" opacity="0.08" />

        {/* Left ear */}
        <g transform="translate(70 20)">
          <motion.g
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '20px 60px' }}
          >
            <ellipse cx="20" cy="40" rx="16" ry="42" fill="#FFF7EE" />
            <ellipse cx="20" cy="44" rx="8" ry="30" fill="#FFD6D6" />
          </motion.g>
        </g>

        {/* Right ear */}
        <g transform="translate(170 20)">
          <motion.g
            animate={{ rotate: [3, -3, 3] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '20px 60px' }}
          >
            <ellipse cx="20" cy="40" rx="16" ry="42" fill="#FFF7EE" />
            <ellipse cx="20" cy="44" rx="8" ry="30" fill="#FFD6D6" />
          </motion.g>
        </g>

        {/* Body */}
        <ellipse cx="130" cy="180" rx="68" ry="50" fill="#FFF7EE" />
        <ellipse cx="130" cy="186" rx="40" ry="28" fill="#FFEFE0" />

        {/* Head */}
        <circle cx="130" cy="120" r="70" fill="#FFF7EE" />

        {/* Cheeks */}
        <circle cx="88" cy="138" r="10" fill="#FFB6B6" opacity="0.7" />
        <circle cx="172" cy="138" r="10" fill="#FFB6B6" opacity="0.7" />

        {/* Eyes */}
        <motion.ellipse
          cx="106"
          cy="118"
          rx="6"
          ry={cfg.ry}
          fill="#2B2118"
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1] }}
          style={{ transformOrigin: '106px 118px' }}
        />
        <motion.ellipse
          cx="154"
          cy="118"
          rx="6"
          ry={cfg.ry}
          fill="#2B2118"
          animate={{ scaleY: [1, 1, 0.1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.92, 0.96, 1] }}
          style={{ transformOrigin: '154px 118px' }}
        />
        <circle cx="108" cy="115" r="1.6" fill="#fff" />
        <circle cx="156" cy="115" r="1.6" fill="#fff" />

        {/* Nose */}
        <path d="M126 138 q4 -4 8 0 q-4 6 -8 0z" fill="#F4A1A1" />

        {/* Mouth */}
        <path d={cfg.mouth} stroke="#2B2118" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        {/* Sad tear */}
        {mood === 'sad' && (
          <motion.circle
            cx="106"
            cy="135"
            r="3"
            fill="#5AB6FF"
            animate={{ cy: [130, 160], opacity: [1, 0] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        )}

        {/* Happy sparkles */}
        {mood === 'happy' && (
          <>
            <motion.text
              x="40"
              y="60"
              fontSize="22"
              animate={{ opacity: [0, 1, 0], scale: [0.6, 1.2, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              ✨
            </motion.text>
            <motion.text
              x="200"
              y="80"
              fontSize="22"
              animate={{ opacity: [0, 1, 0], scale: [0.6, 1.2, 0.6] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }}
            >
              ✨
            </motion.text>
          </>
        )}

        {/* Waving paw */}
        {waving && (
          <motion.g
            animate={{ rotate: [-12, 12, -12] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformOrigin: '60px 170px' }}
          >
            <ellipse cx="60" cy="170" rx="14" ry="18" fill="#FFF7EE" />
            <ellipse cx="60" cy="178" rx="8" ry="6" fill="#FFD6D6" />
          </motion.g>
        )}

        {/* Resting paws */}
        {!waving && (
          <>
            <ellipse cx="86" cy="218" rx="16" ry="10" fill="#FFF7EE" />
            <ellipse cx="174" cy="218" rx="16" ry="10" fill="#FFF7EE" />
          </>
        )}
      </svg>
    </motion.div>
  )
}
