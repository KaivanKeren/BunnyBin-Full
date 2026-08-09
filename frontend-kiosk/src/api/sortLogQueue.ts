// src/api/sortLogQueue.ts
// Antrean log sortir yang bertahan melewati reload, crash tab, dan reboot tablet.
//
// Kiosk sudah punya penanganan offline yang dipikirkan matang: errors.ts
// memisahkan penolakan permanen dari kegagalan sementara, lengkap dengan catatan
// mahalnya kesalahan itu di masa lalu. Seluruh kehati-hatian itu dibangun di atas
// array JavaScript biasa — sehingga satu refresh halaman menghapusnya.
//
// Untuk kiosk yang menyala terus di sekolah dengan WiFi tidak stabil, sesi
// offline panjang yang berakhir dengan reboot adalah kejadian rutin. Setiap
// sortiran anak selama periode itu lenyap tanpa jejak, dan backend tidak pernah
// tahu data itu pernah ada.
//
// Payload sudah membawa `ts` sendiri, jadi log yang terlambat terkirim tetap
// mendarat di waktu kejadiannya — mekanisme itu sudah ada dan sudah diuji di
// backend (KioskIngestTest). Yang hilang hanya ketahanannya terhadap reload.
import type { SortLogPayload } from '@/api/contracts'
import { logger } from '@/lib/logger'

const STORAGE_KEY = 'binexa.kiosk.sortLogQueue'

/**
 * Batas atas antrean. Satu entri ±120 byte, jadi 500 entri ≈ 60 KB — jauh di
 * bawah kuota localStorage (biasanya 5 MB), tapi cukup menahan berhari-hari
 * pemakaian offline. Tanpa batas, kiosk yang ditinggal offline berbulan-bulan
 * akan membuat penulisan localStorage gagal diam-diam dan MENGHENTIKAN
 * persistensi tepat saat ia paling dibutuhkan.
 */
export const MAX_QUEUE = 500

/** Antarmuka minimal localStorage, supaya bisa diuji tanpa browser. */
export interface QueueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): QueueStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Akses localStorage bisa MELEMPAR (mode privat, kebijakan perangkat),
    // bukan sekadar mengembalikan undefined.
    return null
  }
}

/**
 * Cukup untuk menyaring sisa skema lama atau isi storage yang rusak. Tidak
 * memvalidasi penuh: payload cacat yang lolos akan ditolak server sebagai 4xx
 * dan dibuang lewat jalur CloudRejectedError yang sudah ada.
 */
function looksLikePayload(value: unknown): value is SortLogPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>

  return (
    (v.quiz_item_id === null || typeof v.quiz_item_id === 'number') &&
    (v.category_detected === null || typeof v.category_detected === 'string') &&
    (v.is_correct === null || typeof v.is_correct === 'boolean')
  )
}

/**
 * Antrean FIFO yang MENULIS SENDIRI setiap perubahannya ke storage.
 *
 * Sengaja kelas dengan state privat, bukan array telanjang: pemanggil tidak
 * boleh bisa memanggil push/shift lalu lupa mem-persist. Itu persis cara
 * persistensi membusuk diam-diam.
 */
export class SortLogQueue {
  private items: SortLogPayload[] = []
  // Field dideklarasikan eksplisit, bukan lewat parameter property: tsconfig
  // proyek ini memakai `erasableSyntaxOnly`, yang melarang sintaks TS yang tidak
  // bisa dihapus begitu saja saat transpile.
  private readonly storage: QueueStorage | null

  constructor(storage: QueueStorage | null = defaultStorage()) {
    this.storage = storage
    this.items = this.load()
  }

  get length(): number {
    return this.items.length
  }

  /** Entri terdepan tanpa mengeluarkannya — dikirim ulang dulu, baru di-shift. */
  peek(): SortLogPayload | null {
    return this.items[0] ?? null
  }

  push(payload: SortLogPayload): void {
    this.items.push(payload)

    // Buang yang TERTUA saat penuh: sortiran terbaru lebih berguna bagi guru
    // yang sedang memantau, dan membuang yang terbaru berarti kiosk penuh
    // berhenti mencatat sama sekali.
    while (this.items.length > MAX_QUEUE) {
      const dibuang = this.items.shift()
      logger.warn('[kiosk] antrean penuh, log sortir tertua dibuang:', dibuang)
    }

    this.persist()
  }

  shift(): SortLogPayload | null {
    const item = this.items.shift() ?? null
    this.persist()

    return item
  }

  /** Salinan untuk Debug Panel — bukan referensi ke state internal. */
  snapshot(): SortLogPayload[] {
    return [...this.items]
  }

  private load(): SortLogPayload[] {
    if (!this.storage) return []

    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (!raw) return []

      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []

      const sah = parsed.filter(looksLikePayload)
      if (sah.length !== parsed.length) {
        logger.warn(
          `[kiosk] ${parsed.length - sah.length} entri antrean tidak sah, dilewati`,
        )
      }

      return sah.slice(-MAX_QUEUE)
    } catch {
      // Storage rusak tidak boleh mematikan kiosk. Mulai kosong.
      logger.warn('[kiosk] antrean tersimpan tidak terbaca, mulai dari kosong')

      return []
    }
  }

  private persist(): void {
    if (!this.storage) return

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.items))
    } catch {
      // Kuota penuh / storage diblokir. Sesi ini tetap berjalan dengan antrean
      // di memori — hanya tidak bertahan setelah reload. Diam di sini disengaja:
      // melempar akan menjatuhkan alur sortir yang sedang berjalan.
      logger.warn('[kiosk] gagal menyimpan antrean ke localStorage')
    }
  }
}
