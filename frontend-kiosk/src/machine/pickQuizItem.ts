// src/machine/pickQuizItem.ts
// Memilih pertanyaan kuis untuk objek yang terdeteksi kamera.
//
// Fungsi MURNI dan terpisah dari KioskProvider karena dua aturan di dalamnya
// adalah tempat bug termahal proyek ini pernah hidup, dan keduanya mustahil
// diverifikasi dari dalam komponen React tanpa merender apa pun:
//
//   1. TIDAK PERNAH lintas kategori. Dulu fungsi ini berakhir dengan
//      `randomFrom(bank)` — acak dari SELURUH bank — setiap kali confidence
//      rendah. Anak memegang botol plastik, ditanya soal "Kulit pisang",
//      menjawab "organik", dan botolnya masuk tray organik sambil dicatat benar.
//   2. Tanpa kategori terdeteksi, tidak ada pertanyaan yang jujur untuk
//      diajukan sama sekali → null, dan kiosk beralih ke mode manual.
import type { CvDetection, QuizItem } from '@/api/contracts'
import { quizKeywordsFor } from '@/lib/labelToQuiz'

/**
 * Di bawah ambang ini label objek terlalu goyah untuk dipercaya sebagai nama
 * benda; kategorinya masih dipakai, tapi pertanyaannya dipilih acak dalam
 * kategori itu ketimbang mengklaim benda yang salah.
 */
export const HIGH_CONFIDENCE = 0.5

export type Picker = <T>(items: T[]) => T | null

const randomPick: Picker = (items) =>
  items.length ? items[Math.floor(Math.random() * items.length)] : null

/**
 * @param pick  disuntikkan agar test bisa deterministik; produksi memakai acak.
 * @returns null bila tidak ada pertanyaan yang layak diajukan (mode manual).
 */
export function pickQuizItem(
  bank: QuizItem[],
  detection: CvDetection,
  pick: Picker = randomPick,
): QuizItem | null {
  if (!detection.category) return null

  const scoped = bank.filter((q) => q.category === detection.category)
  if (!scoped.length) return null

  // Confidence tinggi + label spesifik → coba tanyakan benda yang persis itu.
  if (detection.confidence >= HIGH_CONFIDENCE) {
    const keywords = quizKeywordsFor(detection.label)

    if (keywords) {
      const matched = scoped.filter((q) =>
        keywords.some((kw) => q.item_name.toLowerCase().includes(kw.toLowerCase())),
      )

      if (matched.length) return pick(matched)
    }
  }

  // Tidak ada padanan label — tetap dalam KATEGORI yang terdeteksi, jadi jawaban
  // benarnya tetap sama dengan isi tong yang sesungguhnya.
  return pick(scoped)
}
