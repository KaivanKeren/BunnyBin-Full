// src/components/HandHint.tsx
// Port 1:1 dari prototype components/HandHint.jsx — tangan menjatuhkan sampah ke tray hijau.
import { motion } from 'framer-motion'

export default function HandHint({ size = 200 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size * 0.7 }} className="relative no-select">
      <svg viewBox="0 0 240 170" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        {/* Tray base */}
        <g>
          <ellipse cx="120" cy="148" rx="80" ry="8" fill="#000" opacity="0.08" />
          <path
            d="M48 100 L192 100 L180 142 Q180 150 172 150 L68 150 Q60 150 60 142 Z"
            fill="#5CB85C"
            stroke="#3FA13F"
            strokeWidth="3"
          />
          <ellipse cx="120" cy="100" rx="72" ry="10" fill="#86CF86" />
          <ellipse cx="120" cy="100" rx="60" ry="6" fill="#3FA13F" opacity="0.4" />
        </g>

        {/* Falling trash item */}
        <motion.g
          animate={{ y: [0, 60, 60], opacity: [1, 1, 0], rotate: [0, 25, 25] }}
          transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.7, 1], ease: 'easeIn' }}
        >
          <circle cx="120" cy="55" r="11" fill="#F2DFCB" stroke="#C9AE93" strokeWidth="2" />
          <path d="M114 52 q4 -6 10 0 q-3 5 -10 0z" fill="#C9AE93" opacity="0.6" />
        </motion.g>

        {/* Hand */}
        <motion.g
          animate={{ y: [0, 14, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="170" y="4" width="50" height="22" rx="5" fill="#7BB3EE" stroke="#3F7DC4" strokeWidth="2" />
          <rect x="170" y="22" width="50" height="7" rx="2" fill="#5499E6" stroke="#3F7DC4" strokeWidth="2" />
          <path
            d="M174 28 Q150 30 134 38 Q124 44 118 52 Q113 58 119 61 Q124 60 128 55 Q133 58 138 55 Q143 58 148 55 Q153 58 158 53 Q172 47 184 39 Q198 32 210 28 Z"
            fill="#FFE0C2"
            stroke="#7A5A3A"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M140 30 Q122 36 114 48 Q108 56 116 60 Q124 56 132 48 Q142 40 146 34 Z"
            fill="#FFE0C2"
            stroke="#7A5A3A"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M118 60 Q112 64 114 70 Q119 73 123 69 Q125 65 123 61 Z"
            fill="#FFE0C2"
            stroke="#7A5A3A"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M130 50 Q134 52 138 50"
            stroke="#C9A07A"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            opacity="0.7"
          />
        </motion.g>

        {/* Down arrow hint */}
        <motion.g
          animate={{ y: [0, 6, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity }}
        >
          <path
            d="M120 78 L120 92 M114 86 L120 92 L126 86"
            stroke="#3FA13F"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
        </motion.g>
      </svg>
    </div>
  )
}
