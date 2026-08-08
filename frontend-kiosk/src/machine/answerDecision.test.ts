import { describe, expect, it } from 'vitest'
import { decideAnswer } from './answerDecision'

/**
 * Mengunci perbaikan P1-4 — bug fungsional inti proyek ini.
 *
 * Perilaku LAMA yang tidak boleh kembali: servo mengikuti kategori quiz item
 * yang dipilih ACAK, bukan hasil deteksi kamera. Anak memegang botol plastik,
 * ditanya soal "Kulit pisang", menjawab "organik" — jawaban BENAR untuk
 * pertanyaan itu — lalu botolnya masuk tray organik dan tercatat is_correct
 * true. Dashboard melaporkan keberhasilan atas pemilahan yang secara fisik
 * salah, dan tidak ada satu pun sinyal bahwa itu terjadi.
 */
describe('decideAnswer', () => {
  it('menyortir sesuai deteksi kamera saat jawaban anak benar', () => {
    expect(decideAnswer('inorganic', 'inorganic')).toEqual({
      sortAs: 'inorganic',
      isCorrect: true,
      outcome: 'correct',
    })
  })

  it('TIDAK menyortir saat jawaban anak salah — beri penjelasan dulu', () => {
    // Sortirnya tetap dijamin terjadi lewat sortir pengaman di KioskProvider
    // bila anak keburu pergi; yang penting di sini servo tidak bergerak ke
    // kategori yang keliru hanya karena anak menekan tombol itu.
    expect(decideAnswer('organic', 'inorganic')).toEqual({
      sortAs: null,
      isCorrect: false,
      outcome: 'wrong',
    })
  })

  it('tidak pernah menyortir ke kategori yang dipilih anak saat deteksi diketahui', () => {
    // Inti bug lama: pilihan anak TIDAK BOLEH menentukan tujuan servo.
    const salah = decideAnswer('organic', 'inorganic')
    expect(salah.sortAs).not.toBe('inorganic')

    const benar = decideAnswer('organic', 'organic')
    expect(benar.sortAs).toBe('organic')
  })

  it('mengikuti pilihan anak HANYA saat kamera gagal mengenali objek', () => {
    // Tanpa deteksi tidak ada kebenaran untuk dibandingkan. Menebak kategori di
    // sini adalah persis cara sampah berakhir di tong yang salah, jadi anak yang
    // memutuskan dan servo mengikutinya.
    expect(decideAnswer(null, 'organic')).toEqual({
      sortAs: 'organic',
      isCorrect: null,
      outcome: 'manual',
    })
    expect(decideAnswer(null, 'inorganic')).toEqual({
      sortAs: 'inorganic',
      isCorrect: null,
      outcome: 'manual',
    })
  })

  it('mencatat null (bukan false) saat objek tidak terdeteksi', () => {
    // Mencatatnya sebagai false akan menurunkan akurasi di dashboard karena
    // kamera yang gagal, bukan karena anaknya keliru — dan angka akurasi itu
    // yang dipakai sekolah untuk menilai program pemilahannya.
    expect(decideAnswer(null, 'organic').isCorrect).toBeNull()
  })

  it('selalu memberi tujuan servo kecuali pada jawaban salah', () => {
    const kombinasi = [
      decideAnswer('organic', 'organic'),
      decideAnswer('inorganic', 'inorganic'),
      decideAnswer(null, 'organic'),
      decideAnswer(null, 'inorganic'),
    ]

    // Setiap benda yang masuk harus berakhir di salah satu tong. Satu-satunya
    // pengecualian yang disengaja adalah jawaban salah, yang menunggu penjelasan.
    for (const hasil of kombinasi) {
      expect(hasil.sortAs).not.toBeNull()
    }
  })
})
