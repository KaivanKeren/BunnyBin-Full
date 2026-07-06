export type BunnyMood = 'neutral' | 'happy' | 'sad' | 'sleepy' | 'curious';

interface BunnyProps {
  mood?: BunnyMood;
  className?: string;
}

/** Boni, maskot BunnyBin — SVG murni supaya nol asset eksternal (offline-first). */
export function Bunny({ mood = 'neutral', className = '' }: BunnyProps) {
  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label="Boni si kelinci">
      {/* telinga */}
      <ellipse cx="70" cy="45" rx="18" ry="42" fill="#ffffff" stroke="#94a3b8" strokeWidth="3" transform="rotate(-10 70 45)" />
      <ellipse cx="130" cy="45" rx="18" ry="42" fill="#ffffff" stroke="#94a3b8" strokeWidth="3" transform="rotate(10 130 45)" />
      <ellipse cx="70" cy="50" rx="8" ry="26" fill="#fda4af" transform="rotate(-10 70 50)" />
      <ellipse cx="130" cy="50" rx="8" ry="26" fill="#fda4af" transform="rotate(10 130 50)" />
      {/* kepala */}
      <circle cx="100" cy="120" r="58" fill="#ffffff" stroke="#94a3b8" strokeWidth="3" />
      {/* pipi */}
      <circle cx="63" cy="136" r="10" fill="#fecdd3" />
      <circle cx="137" cy="136" r="10" fill="#fecdd3" />
      {/* mata */}
      {mood === 'happy' && (
        <>
          <path d="M65 108 q12 -14 24 0" stroke="#334155" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M111 108 q12 -14 24 0" stroke="#334155" strokeWidth="5" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'sad' && (
        <>
          <path d="M64 99 l22 -7" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
          <path d="M136 99 l-22 -7" stroke="#64748b" strokeWidth="4" strokeLinecap="round" />
          <circle cx="77" cy="108" r="6" fill="#334155" />
          <circle cx="123" cy="108" r="6" fill="#334155" />
        </>
      )}
      {mood === 'sleepy' && (
        <>
          <path d="M65 106 h24" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
          <path d="M111 106 h24" stroke="#334155" strokeWidth="5" strokeLinecap="round" />
        </>
      )}
      {(mood === 'neutral' || mood === 'curious') && (
        <>
          <circle cx="77" cy="106" r="7" fill="#334155" />
          <circle cx="123" cy="106" r="7" fill="#334155" />
          <circle cx="79.5" cy="103.5" r="2.5" fill="#ffffff" />
          <circle cx="125.5" cy="103.5" r="2.5" fill="#ffffff" />
        </>
      )}
      {/* hidung */}
      <ellipse cx="100" cy="128" rx="7" ry="5" fill="#fb7185" />
      {/* mulut */}
      {mood === 'happy' && (
        <path d="M85 142 q15 14 30 0" stroke="#334155" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {mood === 'sad' && (
        <path d="M87 152 q13 -11 26 0" stroke="#334155" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
      {(mood === 'neutral' || mood === 'curious' || mood === 'sleepy') && (
        <path d="M92 144 q8 7 16 0" stroke="#334155" strokeWidth="4" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
