import { describe, expect, it } from 'vitest'
import { isCrossOrigin, resolveStreamUrl } from './mjpegSource'
import { CAMERA_PROXY_PATH } from './proxy'

describe('resolveStreamUrl', () => {
  it('menempelkan path feed HP di belakang path proxy', () => {
    expect(resolveStreamUrl(CAMERA_PROXY_PATH, '/mjpegfeed')).toBe('/camera-proxy/mjpegfeed')
  })

  it('mempertahankan query resolusi DroidCam apa adanya', () => {
    // DroidCam membaca query sebagai resolusi (?640x480) — bukan pasangan
    // key=value. Menyentuhnya sama dengan merusaknya.
    expect(resolveStreamUrl(CAMERA_PROXY_PATH, '/mjpegfeed?640x480')).toBe(
      '/camera-proxy/mjpegfeed?640x480',
    )
  })

  it('memaafkan garis miring yang berlebih atau kurang', () => {
    expect(resolveStreamUrl('/camera-proxy/', '/video')).toBe('/camera-proxy/video')
    expect(resolveStreamUrl('/camera-proxy', 'video')).toBe('/camera-proxy/video')
  })

  it('membiarkan URL absolut lewat tanpa diubah', () => {
    // Jalan keluar bagi operator yang sengaja melewati proxy; konsekuensinya
    // pada canvas diperingatkan openMjpegSource().
    expect(resolveStreamUrl(CAMERA_PROXY_PATH, 'http://10.23.3.187:4747/mjpegfeed')).toBe(
      'http://10.23.3.187:4747/mjpegfeed',
    )
  })
})

describe('isCrossOrigin', () => {
  const page = 'http://localhost:5174'

  it('path relatif selalu aman — itulah gunanya proxy', () => {
    expect(isCrossOrigin('/camera-proxy/mjpegfeed?640x480', page)).toBe(false)
  })

  it('origin yang sama tidak menodai canvas', () => {
    expect(isCrossOrigin('http://localhost:5174/camera-proxy/video', page)).toBe(false)
  })

  it('host atau port berbeda = canvas akan ternoda', () => {
    expect(isCrossOrigin('http://10.23.3.187:4747/mjpegfeed', page)).toBe(true)
    // Port berbeda saja sudah cukup — kesalahan konfigurasi yang paling mudah
    // terlewat, karena host-nya terlihat "sama".
    expect(isCrossOrigin('http://localhost:4747/mjpegfeed', page)).toBe(true)
  })
})
