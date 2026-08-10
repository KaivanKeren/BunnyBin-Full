import { afterEach, describe, expect, it, vi } from 'vitest'
import { esp32 } from '@/api/http'
import { RealEsp32Client } from './RealEsp32Client'

/**
 * Satu-satunya penerjemah antara kontrak firmware (ejaan Indonesia:
 * `organik_percent`, `jenis`) dan nama kolom Laravel (`organic_pct`,
 * `category`). Komentar berkasnya sendiri menyebutnya penjaga tunggal —
 * begitu nama Indonesia bocor lewat sini, ia menyebar sampai ke tabel
 * fill_snapshots.
 *
 * Firmware DIBEKUKAN dan hardware tidak tersedia, jadi test ini yang memastikan
 * kontraknya tidak bergeser diam-diam dari sisi software.
 */
const client = new RealEsp32Client()

afterEach(() => {
  vi.restoreAllMocks()
})

function fakeStatus(data: unknown) {
  return vi.spyOn(esp32, 'get').mockResolvedValue({ data } as never)
}

describe('RealEsp32Client.getStatus', () => {
  it('menerjemahkan nama Indonesia firmware ke kontrak Laravel', () => {
    fakeStatus({
      organik_distance_cm: 27.5,
      organik_percent: 50,
      anorganik_distance_cm: 11,
      anorganik_percent: 80,
      servo_angle: 90,
    })

    return expect(client.getStatus()).resolves.toEqual({
      organic_pct: 50,
      inorganic_pct: 80,
      organic_distance_cm: 27.5,
      inorganic_distance_cm: 11,
      servo_pos: 'idle',
    })
  })

  it('meneruskan jarak mentah apa adanya', async () => {
    // Konversi jarak→persen milik backend supaya kalibrasi tong bisa diubah
    // dari dashboard tanpa flash ulang firmware. Membulatkan atau mengonversi
    // di sini akan memindahkan keputusan itu ke perangkat.
    fakeStatus({
      organik_distance_cm: 33.3,
      organik_percent: 39,
      anorganik_distance_cm: 12.7,
      anorganik_percent: 77,
      servo_angle: 20,
    })

    const status = await client.getStatus()

    expect(status.organic_distance_cm).toBe(33.3)
    expect(status.inorganic_distance_cm).toBe(12.7)
  })

  it.each([
    [20, 'organic'],
    [45, 'organic'],
    [90, 'idle'],
    [135, 'inorganic'],
    [160, 'inorganic'],
  ])('memetakan sudut servo %i menjadi %s', async (angle, expected) => {
    fakeStatus({
      organik_distance_cm: 20,
      organik_percent: 60,
      anorganik_distance_cm: 20,
      anorganik_percent: 60,
      servo_angle: angle,
    })

    expect((await client.getStatus()).servo_pos).toBe(expected)
  })

  it('MELEMPAR bila field wajib hilang, alih-alih meneruskan NaN', async () => {
    // Respons yang tidak sesuai berarti kita bicara dengan firmware lain atau
    // captive portal yang membalas HTML. Melemparnya membuat kiosk menandai
    // ESP32 offline — jauh lebih jujur daripada "NaN%" di layar anak dan
    // payload yang ditolak 422 tiap 30 detik.
    fakeStatus({ organik_percent: 50 })

    await expect(client.getStatus()).rejects.toThrow(/organik_distance_cm|anorganik/)
  })

  it('MELEMPAR bila field bukan angka', async () => {
    fakeStatus({
      organik_distance_cm: 'entah',
      organik_percent: 50,
      anorganik_distance_cm: 20,
      anorganik_percent: 60,
      servo_angle: 90,
    })

    await expect(client.getStatus()).rejects.toThrow(/organik_distance_cm/)
  })

  it('menerima angka yang dikirim sebagai string', async () => {
    // ArduinoJson kadang membuat serialisasi berubah bentuk antar versi;
    // menolak "27.5" akan mematikan kiosk karena alasan kosmetik.
    fakeStatus({
      organik_distance_cm: '27.5',
      organik_percent: '50',
      anorganik_distance_cm: '11',
      anorganik_percent: '80',
      servo_angle: '90',
    })

    expect((await client.getStatus()).organic_pct).toBe(50)
  })
})

describe('RealEsp32Client.sort', () => {
  it('mengirim ejaan firmware, bukan nama kontrak Laravel', async () => {
    const post = vi
      .spyOn(esp32, 'post')
      .mockResolvedValue({ data: { success: true, jenis: 'organik', servo_angle: 20 } } as never)

    await client.sort({ category: 'organic' })

    expect(post).toHaveBeenCalledWith(
      '/api/sort',
      { jenis: 'organik' },
      expect.objectContaining({ timeout: expect.any(Number) }),
    )
  })

  it('memetakan inorganic menjadi anorganik', async () => {
    const post = vi
      .spyOn(esp32, 'post')
      .mockResolvedValue({ data: { success: true, jenis: 'anorganik', servo_angle: 160 } } as never)

    await client.sort({ category: 'inorganic' })

    expect(post.mock.calls[0][1]).toEqual({ jenis: 'anorganik' })
  })

  it('memakai timeout jauh di atas default karena firmware menahan respons', async () => {
    // Firmware sengaja menunggu servo selesai (~1,4 detik) sebelum membalas.
    // Dengan timeout default 4 detik, WiFi sekolah yang lambat membuat kiosk
    // menandai ESP32 offline tepat ketika alatnya bekerja normal.
    const post = vi
      .spyOn(esp32, 'post')
      .mockResolvedValue({ data: { success: true, jenis: 'organik', servo_angle: 20 } } as never)

    await client.sort({ category: 'organic' })

    const config = post.mock.calls[0][2] as { timeout: number }
    expect(config.timeout).toBeGreaterThan(4000)
  })

  it('melaporkan error bila firmware menjawab success: false', async () => {
    vi.spyOn(esp32, 'post').mockResolvedValue({
      data: { success: false, jenis: 'organik', servo_angle: 90 },
    } as never)

    expect(await client.sort({ category: 'organic' })).toEqual({
      status: 'error',
      servo_pos: 'organic',
    })
  })
})
