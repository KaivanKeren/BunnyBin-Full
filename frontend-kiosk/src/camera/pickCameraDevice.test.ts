import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DEVICE_PATTERNS,
  parseDevicePatterns,
  pickCameraDevice,
  type VideoInputLike,
} from './pickCameraDevice'

const laptop: VideoInputLike = { deviceId: 'aaa', label: 'ACER QHD User Facing: ACER QHD' }
const droidcam: VideoInputLike = { deviceId: 'bbb', label: 'Droidcam (v4l2)' }
const iriun: VideoInputLike = { deviceId: 'ccc', label: 'Iriun Webcam' }

describe('parseDevicePatterns', () => {
  it('memakai pola bawaan bila env tidak diset', () => {
    expect(parseDevicePatterns(undefined)).toEqual([...DEFAULT_DEVICE_PATTERNS])
  })

  it('membaca daftar berkoma, tanpa spasi dan huruf besar', () => {
    expect(parseDevicePatterns(' DroidCam , Iriun ')).toEqual(['droidcam', 'iriun'])
  })

  it('nilai kosong berarti "jangan cocokkan apa pun", bukan kembali ke bawaan', () => {
    // Operator yang sengaja mengosongkannya ingin kamera default host —
    // mengembalikan bawaan di sini akan mengabaikan permintaannya diam-diam.
    expect(parseDevicePatterns('')).toEqual([])
    expect(parseDevicePatterns('  ,  ')).toEqual([])
  })
})

describe('pickCameraDevice', () => {
  it('memilih kamera HP walau kamera laptop terdaftar lebih dulu', () => {
    expect(pickCameraDevice([laptop, droidcam], ['droidcam'])).toBe(droidcam)
  })

  it('prioritas mengikuti urutan POLA, bukan urutan device', () => {
    // Iriun lebih dulu didaftarkan sistem, tapi pola menyebut droidcam duluan.
    expect(pickCameraDevice([iriun, droidcam], ['droidcam', 'iriun'])).toBe(droidcam)
    expect(pickCameraDevice([iriun, droidcam], ['iriun', 'droidcam'])).toBe(iriun)
  })

  it('mencocokkan sebagian label tanpa peduli huruf besar-kecil', () => {
    expect(pickCameraDevice([droidcam], ['DROIDCAM'])).toBe(droidcam)
    expect(pickCameraDevice([{ deviceId: 'd', label: 'IP Webcam Bridge' }], ['ip webcam']))
      .toEqual({ deviceId: 'd', label: 'IP Webcam Bridge' })
  })

  it('null bila tak ada yang cocok — pemanggil yang memutuskan artinya', () => {
    expect(pickCameraDevice([laptop], ['droidcam'])).toBeNull()
    expect(pickCameraDevice([], ['droidcam'])).toBeNull()
    expect(pickCameraDevice([laptop, droidcam], [])).toBeNull()
  })

  it('null saat label masih kosong karena izin kamera belum diberikan', () => {
    // enumerateDevices() mengembalikan label kosong sebelum izin pertama.
    // Kalau ini sampai cocok, kiosk akan memilih device sembarang.
    const unlabeled = [
      { deviceId: 'aaa', label: '' },
      { deviceId: 'bbb', label: '' },
    ]
    expect(pickCameraDevice(unlabeled, [...DEFAULT_DEVICE_PATTERNS])).toBeNull()
  })
})
