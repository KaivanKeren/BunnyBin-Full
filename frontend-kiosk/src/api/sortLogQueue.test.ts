import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SortLogPayload } from '@/api/contracts'
import { MAX_QUEUE, SortLogQueue, type QueueStorage } from './sortLogQueue'

/** localStorage palsu — sekaligus memungkinkan simulasi reload yang jujur. */
function fakeStorage(): QueueStorage & { dump(): Record<string, string> } {
  const data: Record<string, string> = {}

  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    removeItem: (k) => {
      delete data[k]
    },
    dump: () => ({ ...data }),
  }
}

function log(n: number): SortLogPayload {
  return {
    quiz_item_id: n,
    category_detected: 'organic',
    confidence: 0.9,
    is_correct: true,
    ts: `2026-08-08T00:00:${String(n).padStart(2, '0')}Z`,
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('SortLogQueue', () => {
  it('bertahan melewati reload — inti P1-6', () => {
    // Skenario nyata: WiFi sekolah putus, anak tetap memakai kiosk, lalu tablet
    // di-refresh atau reboot. Dulu SELURUH sortiran selama periode itu lenyap
    // tanpa jejak dan backend tidak pernah tahu data itu pernah ada.
    const storage = fakeStorage()

    const sebelumReload = new SortLogQueue(storage)
    sebelumReload.push(log(1))
    sebelumReload.push(log(2))
    sebelumReload.push(log(3))

    // Instance baru dari storage yang sama = kiosk yang baru dimuat ulang.
    const setelahReload = new SortLogQueue(storage)

    expect(setelahReload.length).toBe(3)
    expect(setelahReload.snapshot().map((l) => l.quiz_item_id)).toEqual([1, 2, 3])
  })

  it('mempertahankan urutan FIFO — sortiran tertua terkirim lebih dulu', () => {
    const queue = new SortLogQueue(fakeStorage())
    queue.push(log(1))
    queue.push(log(2))

    expect(queue.peek()?.quiz_item_id).toBe(1)
    expect(queue.shift()?.quiz_item_id).toBe(1)
    expect(queue.peek()?.quiz_item_id).toBe(2)
  })

  it('menyimpan setiap shift, bukan hanya push', () => {
    // Kalau hanya push yang di-persist, entri yang sudah TERKIRIM akan muncul
    // lagi setelah reload dan tercatat dobel di dashboard.
    const storage = fakeStorage()

    const queue = new SortLogQueue(storage)
    queue.push(log(1))
    queue.push(log(2))
    queue.shift()

    expect(new SortLogQueue(storage).snapshot().map((l) => l.quiz_item_id)).toEqual([2])
  })

  it('membuang entri TERTUA saat mencapai batas', () => {
    const queue = new SortLogQueue(fakeStorage())
    for (let i = 1; i <= MAX_QUEUE + 3; i++) queue.push(log(i))

    expect(queue.length).toBe(MAX_QUEUE)
    // Yang terbaru harus selamat: kiosk penuh tidak boleh berhenti mencatat.
    expect(queue.snapshot().at(-1)?.quiz_item_id).toBe(MAX_QUEUE + 3)
    expect(queue.snapshot().at(0)?.quiz_item_id).toBe(4)
  })

  it('snapshot adalah salinan, bukan referensi ke state internal', () => {
    const queue = new SortLogQueue(fakeStorage())
    queue.push(log(1))

    queue.snapshot().push(log(99))

    expect(queue.length).toBe(1)
  })

  it('mulai kosong bila isi storage rusak, bukan crash', () => {
    const storage = fakeStorage()
    storage.setItem('binexa.kiosk.sortLogQueue', '{bukan json array')

    expect(new SortLogQueue(storage).length).toBe(0)
  })

  it('mulai kosong bila isi storage bukan array', () => {
    const storage = fakeStorage()
    storage.setItem('binexa.kiosk.sortLogQueue', '{"a":1}')

    expect(new SortLogQueue(storage).length).toBe(0)
  })

  it('melewati entri berbentuk salah tapi mempertahankan yang sah', () => {
    // Sisa skema lama tidak boleh menyeret entri yang masih baik ikut terbuang.
    const storage = fakeStorage()
    storage.setItem(
      'binexa.kiosk.sortLogQueue',
      JSON.stringify([log(1), { sampah: true }, null, 'bukan objek', log(2)]),
    )

    expect(new SortLogQueue(storage).snapshot().map((l) => l.quiz_item_id)).toEqual([1, 2])
  })

  it('menerima entri mode manual (is_correct null)', () => {
    // Mode manual dari task 2.1 mencatat is_correct null. Validasi bentuk tidak
    // boleh membuangnya sebagai entri cacat.
    const storage = fakeStorage()
    const manual: SortLogPayload = {
      quiz_item_id: null,
      category_detected: null,
      confidence: null,
      is_correct: null,
    }

    new SortLogQueue(storage).push(manual)

    expect(new SortLogQueue(storage).length).toBe(1)
  })

  it('tetap berfungsi di memori saat storage tidak tersedia', () => {
    // Mode privat / kebijakan perangkat memblokir localStorage. Kiosk harus
    // tetap jalan — hanya kehilangan ketahanan terhadap reload.
    const queue = new SortLogQueue(null)
    queue.push(log(1))

    expect(queue.length).toBe(1)
    expect(queue.peek()?.quiz_item_id).toBe(1)
  })

  it('tidak melempar saat penulisan storage gagal (kuota penuh)', () => {
    const storage: QueueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }

    const queue = new SortLogQueue(storage)

    // Melempar di sini akan menjatuhkan alur sortir yang sedang berjalan —
    // anak melihat kiosk macet karena storage penuh.
    expect(() => queue.push(log(1))).not.toThrow()
    expect(queue.length).toBe(1)
  })

  it('tidak melempar saat localStorage global tidak ada (SSR/test node)', () => {
    expect(() => new SortLogQueue()).not.toThrow()
  })
})
