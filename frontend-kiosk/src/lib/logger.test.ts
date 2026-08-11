import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `enabled` di logger dihitung SEKALI saat modul dimuat (sengaja — ia
 * dievaluasi 5x/detik di loop deteksi, dan localStorage adalah API sinkron).
 * Jadi tiap skenario butuh modul yang dimuat ulang dengan env berbeda.
 */
async function loadLogger(debugPanel: string) {
  vi.resetModules()
  vi.stubEnv('VITE_DEBUG_PANEL', debugPanel)

  return (await import('./logger')).logger
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('SENYAP untuk debug saat panel debug mati — inti P3-3', () => {
    // Loop deteksi 5 fps sebelumnya mencatat panjang setiap frame dan hasil
    // klasifikasinya. Di tablet yang menyala berhari-hari, buffer console
    // tumbuh terus dan tiap panggilan menahan objek deteksi dari GC.
    return loadLogger('false').then((logger) => {
      logger.debug('[detect] 🔍 frame 12345 bytes')
      logger.debug('[detect] ⏱️ FPS: 5')

      expect(console.log).not.toHaveBeenCalled()
    })
  })

  it('tetap menampilkan warn meski debug mati', async () => {
    // Kalau semuanya ikut dimatikan, kegagalan nyata jadi tak terlihat — persis
    // mode kegagalan yang dicatat api/errors.ts sebagai pelajaran mahal: log
    // sortir dibuang diam-diam sementara kiosk tampak sehat.
    const logger = await loadLogger('false')

    logger.warn('[kiosk] log sortiran ditolak server')
    logger.error('[kiosk] gagal fatal')

    expect(console.warn).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledOnce()
  })

  it('menampilkan debug saat panel debug hidup', async () => {
    const logger = await loadLogger('true')

    logger.debug('[kiosk] 📷 Memulai scan')

    expect(console.log).toHaveBeenCalledOnce()
  })

  it('meneruskan seluruh argumen apa adanya', async () => {
    const logger = await loadLogger('true')
    const detail = { category: 'organic', confidence: 0.9 }

    logger.debug('[kiosk] 📦 Hasil classify:', detail)

    expect(console.log).toHaveBeenCalledWith('[kiosk] 📦 Hasil classify:', detail)
  })

  it('tidak melempar saat localStorage tidak tersedia', async () => {
    // Lingkungan test node tidak punya localStorage; mode privat browser bisa
    // MELEMPAR saat diakses, bukan sekadar mengembalikan undefined.
    await expect(loadLogger('false')).resolves.toBeDefined()
  })
})
