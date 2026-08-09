import { describe, expect, it } from 'vitest'
import type { CvDetection, QuizItem } from '@/api/contracts'
import { LABEL_TO_QUIZ, quizKeywordsFor } from '@/lib/labelToQuiz'
import { pickQuizItem } from './pickQuizItem'
import fallbackBankRaw from '@/mocks/quizBank.json'

const fallbackBank = fallbackBankRaw as unknown as QuizItem[]

/**
 * Bank kuis dari seeder backend (DatabaseSeeder). Sengaja disalin apa adanya:
 * inilah bank yang benar-benar dipakai kiosk saat online, dan isinya BERBEDA
 * dari fallback offline. Pemetaan label harus bekerja untuk keduanya — kalau
 * hanya diuji terhadap salah satunya, pencocokan bisa mati diam-diam persis di
 * kondisi yang paling sering terjadi.
 */
const seededBank: QuizItem[] = [
  ['organic', 'Kulit pisang'],
  ['organic', 'Daun kering'],
  ['organic', 'Sisa nasi'],
  ['organic', 'Kulit jeruk'],
  ['organic', 'Ampas teh'],
  ['inorganic', 'Botol plastik'],
  ['inorganic', 'Kaleng minuman'],
  ['inorganic', 'Sedotan plastik'],
  ['inorganic', 'Bungkus snack'],
  ['inorganic', 'Styrofoam'],
].map(([category, item_name], i) => ({
  id: i + 1,
  category: category as QuizItem['category'],
  item_name: item_name as string,
  image_url: null,
  explanation: null,
  active: true,
}))

function detect(partial: Partial<CvDetection>): CvDetection {
  return {
    category: null,
    label: null,
    confidence: 0.9,
    bbox: null,
    model_version: 'test',
    ...partial,
  }
}

/** Ambil elemen pertama — membuat pemilihan deterministik di test. */
const first = <T,>(items: T[]): T | null => items[0] ?? null

describe('LABEL_TO_QUIZ', () => {
  it('semua kunci huruf kecil — kunci ber-huruf besar adalah entri mati', () => {
    // quizKeywordsFor mencari dengan label.toLowerCase(). Kunci seperti
    // "Sampah Organik" tidak akan pernah terbaca, jadi menambahkannya hanya
    // menciptakan ilusi bahwa label itu tertangani.
    for (const key of Object.keys(LABEL_TO_QUIZ)) {
      expect(key, `kunci "${key}" harus huruf kecil`).toBe(key.toLowerCase())
    }
  })

  it('tidak ada daftar kata kunci yang kosong', () => {
    for (const [key, keywords] of Object.entries(LABEL_TO_QUIZ)) {
      expect(keywords.length, `kunci "${key}" tidak punya kata kunci`).toBeGreaterThan(0)
    }
  })

  it('label model produksi Binexa yang punya padanan benar-benar cocok ke kedua bank', () => {
    // Inti P2-3: tabel lama hanya berisi label COCO, sedangkan model produksi
    // mengeluarkan label Indonesia — jadi TIDAK SATU PUN kunci pernah cocok dan
    // cabang pencocokan spesifik mati total.
    const wajibCocok: Array<[string, string]> = [
      ['kulit_buah', 'organic'],
      ['daun_kering', 'organic'],
      ['sisa_makanan', 'organic'],
      ['botol_plastik', 'inorganic'],
      ['kaleng', 'inorganic'],
      ['sedotan_plastik', 'inorganic'],
      ['bungkus_snack', 'inorganic'],
    ]

    for (const [label, category] of wajibCocok) {
      const keywords = quizKeywordsFor(label)
      expect(keywords, `label "${label}" belum ada di tabel`).not.toBeNull()

      for (const [namaBank, bank] of [
        ['seeder backend', seededBank],
        ['fallback kiosk', fallbackBank],
      ] as const) {
        const cocok = bank.filter(
          (q) =>
            q.category === category &&
            keywords!.some((kw) => q.item_name.toLowerCase().includes(kw.toLowerCase())),
        )
        expect(cocok.length, `"${label}" tidak cocok apa pun di ${namaBank}`).toBeGreaterThan(0)
      }
    }
  })

  it('label kategori Roboflow sengaja TIDAK dipetakan', () => {
    // "Sampah Organik" adalah label KATEGORI, bukan nama benda. Tidak ada benda
    // spesifik untuk ditanyakan, dan perilaku yang benar justru fallback acak
    // dalam kategori — yang sudah terjadi sendiri saat label tak dikenali.
    expect(quizKeywordsFor('Sampah Organik')).toBeNull()
    expect(quizKeywordsFor('Sampah Anorganik')).toBeNull()
  })

  it('label COCO dipertahankan untuk mode demo', () => {
    expect(quizKeywordsFor('bottle')).not.toBeNull()
    expect(quizKeywordsFor('banana')).not.toBeNull()
  })
})

describe('pickQuizItem', () => {
  it('menanyakan benda yang persis terdeteksi bila labelnya dikenali', () => {
    const item = pickQuizItem(
      seededBank,
      detect({ category: 'inorganic', label: 'botol_plastik', confidence: 0.9 }),
      first,
    )

    expect(item?.item_name).toBe('Botol plastik')
  })

  it('mencocokkan label snake_case tanpa peduli huruf besar/kecil', () => {
    const item = pickQuizItem(
      seededBank,
      detect({ category: 'organic', label: 'KULIT_BUAH', confidence: 0.9 }),
      first,
    )

    expect(item?.item_name).toBe('Kulit pisang')
  })

  it('TIDAK PERNAH keluar dari kategori yang terdeteksi', () => {
    // Aturan terpenting: inilah yang dulu dilanggar dan membuat botol plastik
    // masuk tray organik sambil dicatat sebagai sortiran yang benar.
    for (const label of [...Object.keys(LABEL_TO_QUIZ), 'label-tak-dikenal', null]) {
      for (const category of ['organic', 'inorganic'] as const) {
        for (const confidence of [0, 0.3, 0.49, 0.5, 1]) {
          const item = pickQuizItem(seededBank, detect({ category, label, confidence }))
          expect(item?.category, `label=${label} conf=${confidence}`).toBe(category)
        }
      }
    }
  })

  it('jatuh ke acak dalam kategori saat confidence di bawah ambang', () => {
    // Label goyah tidak boleh dipercaya sebagai nama benda, tapi kategorinya
    // masih dipakai — jadi jawaban benarnya tetap sesuai isi tong.
    const item = pickQuizItem(
      seededBank,
      detect({ category: 'inorganic', label: 'botol_plastik', confidence: 0.3 }),
      first,
    )

    expect(item?.category).toBe('inorganic')
    expect(item?.item_name).toBe('Botol plastik') // `first` mengambil yang pertama di kategori
  })

  it('jatuh ke acak dalam kategori untuk label yang tidak punya padanan kuis', () => {
    // `masker` dan `rumput` ada di model tapi tidak ada di bank kuis mana pun.
    // Itu bukan kesalahan — fallback kategori sudah perilaku yang benar.
    const item = pickQuizItem(
      seededBank,
      detect({ category: 'inorganic', label: 'masker', confidence: 0.95 }),
      first,
    )

    expect(item?.category).toBe('inorganic')
  })

  it('mengembalikan null saat kategori tidak terdeteksi (mode manual)', () => {
    expect(pickQuizItem(seededBank, detect({ category: null, confidence: 0 }))).toBeNull()
    expect(
      pickQuizItem(seededBank, detect({ category: null, label: 'botol_plastik', confidence: 0.9 })),
    ).toBeNull()
  })

  it('mengembalikan null bila bank tidak punya entri untuk kategori itu', () => {
    const hanyaOrganik = seededBank.filter((q) => q.category === 'organic')

    expect(pickQuizItem(hanyaOrganik, detect({ category: 'inorganic', confidence: 0.9 }))).toBeNull()
  })

  it('tidak pernah melempar pada bank kosong', () => {
    expect(pickQuizItem([], detect({ category: 'organic', confidence: 0.9 }))).toBeNull()
  })
})
