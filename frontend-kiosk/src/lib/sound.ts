// src/lib/sound.ts
// Feedback suara ringan via Web Audio API (tanpa file aset). PRD §2 menyebut Howler.js —
// swap ke Howler saat aset reward asli tersedia; sementara ini nada sintetis supaya kiosk
// tidak bisu. Menghormati flag `muted`.
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine'): void {
  const ac = audio()
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t0 = ac.currentTime + start
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export function playSuccess(muted: boolean): void {
  if (muted) return
  // arpeggio ceria naik
  tone(523.25, 0, 0.14) // C5
  tone(659.25, 0.12, 0.14) // E5
  tone(783.99, 0.24, 0.22) // G5
}

export function playError(muted: boolean): void {
  if (muted) return
  tone(311.13, 0, 0.22, 'triangle') // Eb4 lembut, tidak menakuti anak
  tone(233.08, 0.18, 0.28, 'triangle') // Bb3
}

export function playClick(muted: boolean): void {
  if (muted) return
  tone(880, 0, 0.06, 'square')
}
