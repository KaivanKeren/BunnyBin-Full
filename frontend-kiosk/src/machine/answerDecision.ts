// src/machine/answerDecision.ts
// Keputusan tunggal saat anak menekan salah satu tombol kategori.
//
// Sengaja fungsi MURNI dan terpisah dari KioskProvider: inilah tempat bug paling
// mahal proyek ini pernah hidup, dan di dalam komponen React ia hanya bisa
// diverifikasi dengan membaca kode.
//
// Aturan yang dijaga di sini:
//
//   1. Servo mengikuti DETEKSI KAMERA, bukan kategori quiz item dan bukan
//      pilihan anak. Sebelumnya servo mengikuti quiz item yang dipilih ACAK,
//      sehingga botol plastik bisa masuk tray organik sambil dicatat "benar".
//   2. Tanpa deteksi, tidak ada yang bisa dinilai. Anak memilah manual,
//      hasilnya dicatat is_correct: null — bukan false, karena yang gagal
//      adalah kameranya, bukan anaknya.
//   3. Jawaban salah TIDAK langsung menyortir: anak diberi penjelasan dan
//      kesempatan mencoba lagi. Sortirnya dijamin terjadi lewat sortir pengaman
//      bila anak keburu pergi.
import type { WasteCategory } from '@/api/contracts'

export interface AnswerDecision {
  /** Kategori yang harus dituju servo, atau null bila belum saatnya menyortir. */
  sortAs: WasteCategory | null
  /** null = tidak dapat dinilai (CV gagal), bukan "salah". */
  isCorrect: boolean | null
  /** Layar berikutnya. */
  outcome: 'correct' | 'wrong' | 'manual'
}

export function decideAnswer(
  detected: WasteCategory | null,
  choice: WasteCategory,
): AnswerDecision {
  if (detected === null) {
    return { sortAs: choice, isCorrect: null, outcome: 'manual' }
  }

  if (choice === detected) {
    return { sortAs: detected, isCorrect: true, outcome: 'correct' }
  }

  return { sortAs: null, isCorrect: false, outcome: 'wrong' }
}
