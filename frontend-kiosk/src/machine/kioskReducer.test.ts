import { describe, expect, it } from 'vitest'
import type { CvDetection, Esp32Status, QuizItem } from '@/api/contracts'
import {
  fillLocked,
  fillWarning,
  initialState,
  kioskReducer,
  type KioskState,
} from './kioskReducer'

const item: QuizItem = {
  id: 1,
  category: 'organic',
  item_name: 'Kulit pisang',
  image_url: null,
  explanation: null,
  active: true,
}

const detection: CvDetection = {
  category: 'organic',
  label: 'kulit_buah',
  confidence: 0.9,
  bbox: null,
  model_version: 'test',
}

function fill(organic: number, inorganic: number): Esp32Status {
  return { organic_pct: organic, inorganic_pct: inorganic, servo_pos: 'idle' }
}

/** Jalankan serangkaian aksi dari initialState. */
function run(...actions: Parameters<typeof kioskReducer>[1][]): KioskState {
  return actions.reduce(kioskReducer, initialState)
}

describe('kioskReducer', () => {
  it('membersihkan sisa siklus sebelumnya saat scan baru dimulai', () => {
    // Kalau item/detection/wrongChoice lama ikut terbawa, layar pertanyaan
    // berikutnya bisa menampilkan benda dari anak sebelumnya.
    const state = run(
      { type: 'SCAN_START' },
      { type: 'SCAN_DONE', detection, item },
      { type: 'ANSWER_WRONG', choice: 'inorganic' },
      { type: 'SCAN_START' },
    )

    expect(state.phase).toBe('scanning')
    expect(state.item).toBeNull()
    expect(state.detection).toBeNull()
    expect(state.wrongChoice).toBeNull()
  })

  it('menerima item null — mode manual saat CV gagal', () => {
    const state = run({ type: 'SCAN_START' }, { type: 'SCAN_DONE', detection, item: null })

    expect(state.phase).toBe('question')
    expect(state.item).toBeNull()
  })

  it('menambah skor hanya setelah servo selesai, bukan saat jawaban benar', () => {
    // ANSWER_CORRECT hanya memindahkan ke fase 'sorting'. Menaikkan skor di
    // sana akan memberi bintang untuk sortiran yang gagal digerakkan servo.
    const setelahJawab = run({ type: 'SCAN_DONE', detection, item }, { type: 'ANSWER_CORRECT' })
    expect(setelahJawab.phase).toBe('sorting')
    expect(setelahJawab.score).toBe(0)

    const setelahSortir = kioskReducer(setelahJawab, { type: 'SORT_DONE' })
    expect(setelahSortir.phase).toBe('success')
    expect(setelahSortir.score).toBe(10)
    expect(setelahSortir.successCount).toBe(1)
  })

  it('mengingat pilihan yang salah supaya tombolnya bisa dinonaktifkan', () => {
    const state = run({ type: 'SCAN_DONE', detection, item }, { type: 'ANSWER_WRONG', choice: 'inorganic' })

    expect(state.phase).toBe('error')
    expect(state.wrongChoice).toBe('inorganic')
  })

  it('mengembalikan ke pertanyaan tanpa melupakan pilihan yang sudah salah', () => {
    const state = run(
      { type: 'SCAN_DONE', detection, item },
      { type: 'ANSWER_WRONG', choice: 'inorganic' },
      { type: 'RETRY_QUESTION' },
    )

    expect(state.phase).toBe('question')
    expect(state.wrongChoice).toBe('inorganic')
  })

  it('mengunci HANYA dari idle — tidak memotong anak yang sedang menjawab', () => {
    // Tong penuh di tengah sesi tidak boleh membuat layar berganti mendadak;
    // sampah yang sudah masuk harus tetap diselesaikan alurnya.
    const sedangMenjawab = run({ type: 'SCAN_DONE', detection, item }, { type: 'FULL_LOCK' })
    expect(sedangMenjawab.phase).toBe('question')

    const dariIdle = kioskReducer(initialState, { type: 'FULL_LOCK' })
    expect(dariIdle.phase).toBe('full_lock')
  })

  it('melepas kunci hanya dari full_lock', () => {
    const terkunci = kioskReducer(initialState, { type: 'FULL_LOCK' })
    expect(kioskReducer(terkunci, { type: 'FULL_RELEASE' }).phase).toBe('idle')

    const sedangMemindai = kioskReducer(initialState, { type: 'SCAN_START' })
    expect(kioskReducer(sedangMemindai, { type: 'FULL_RELEASE' }).phase).toBe('scanning')
  })

  it('mempertahankan skor lintas siklus tapi membersihkan konteks benda', () => {
    const state = run(
      { type: 'SCAN_DONE', detection, item },
      { type: 'ANSWER_CORRECT' },
      { type: 'SORT_DONE' },
      { type: 'RESET' },
    )

    expect(state.phase).toBe('idle')
    expect(state.score).toBe(10)
    expect(state.item).toBeNull()
    expect(state.detection).toBeNull()
  })

  it('flag offline tidak mengubah fase — overlay, bukan state', () => {
    const state = run(
      { type: 'SCAN_DONE', detection, item },
      { type: 'SET_CLOUD_OFFLINE', offline: true },
      { type: 'SET_ESP32_OFFLINE', offline: true },
    )

    expect(state.phase).toBe('question')
    expect(state.cloudOffline).toBe(true)
    expect(state.esp32Offline).toBe(true)
  })
})

describe('ambang fill', () => {
  it('memakai kompartemen TERPENUH, bukan rata-rata', () => {
    // Satu tong penuh sudah cukup jadi masalah; merata-ratakan akan
    // menyembunyikannya di balik tong satunya yang kosong.
    expect(fillWarning(fill(0, 75))).toBe(true)
    expect(fillLocked(fill(95, 0))).toBe(true)
  })

  it('ambangnya inklusif', () => {
    expect(fillWarning(fill(70, 0))).toBe(true)
    expect(fillWarning(fill(69, 0))).toBe(false)
    expect(fillLocked(fill(90, 0))).toBe(true)
    expect(fillLocked(fill(89, 0))).toBe(false)
  })
})
