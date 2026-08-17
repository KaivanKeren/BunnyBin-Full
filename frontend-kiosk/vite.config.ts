import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import { CAMERA_PROXY_PATH } from './src/camera/proxy'

const DEFAULT_CAMERA_URL = 'http://10.23.3.187:4747'

/**
 * Proxy stream kamera HP.
 *
 * Ada BUKAN untuk kenyamanan, tapi karena tanpanya jalur MJPEG tidak berfungsi
 * sama sekali. Kiosk menggambar frame kamera ke <canvas> lalu memanggil
 * toDataURL() untuk mengirimnya ke classify(); gambar lintas-origin tanpa header
 * CORS — dan DroidCam tidak mengirim satu pun — membuat canvas "ternoda"
 * sehingga toDataURL() melempar SecurityError. Lewat proxy ini, bagi browser
 * feed HP berasal dari origin kiosk sendiri.
 *
 * `timeout: 0` juga wajib: respons multipart/x-mixed-replace memang tidak
 * pernah selesai, jadi batas waktu apa pun akan memutus kamera di tengah jalan.
 */
function cameraProxy(target: string): Record<string, ProxyOptions> {
  return {
    [CAMERA_PROXY_PATH]: {
      target,
      changeOrigin: true,
      ws: false,
      timeout: 0,
      proxyTimeout: 0,
      rewrite: (path) => path.slice(CAMERA_PROXY_PATH.length) || '/',
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Target proxy dibaca dari env yang SAMA dengan yang dipakai kiosk
  // (VITE_CAMERA_STREAM_URL) supaya alamat HP hanya ditulis di satu tempat.
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const proxy = cameraProxy(env.VITE_CAMERA_STREAM_URL || DEFAULT_CAMERA_URL)

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: true, // kiosk device di jaringan lokal
      // Port DITETAPKAN, tidak dibiarkan default. Kedua frontend sama-sama
      // default ke 5173, jadi menjalankannya bersamaan menggeser salah satunya
      // ke 5174 secara kebetulan — dan config/cors.php serta
      // SANCTUM_STATEFUL_DOMAINS di backend mengandaikan pembagian yang TETAP:
      // 5173 = kiosk. Urutan start yang berbeda diam-diam
      // menukar keduanya dan menghasilkan 419/CORS yang membingungkan.
      port: 5174,
      strictPort: true,
      proxy,
    },
    // `npm run preview` melayani bundle produksi dan dipakai untuk uji terima
    // sebelum deploy — kameranya harus hidup di sana juga, bukan hanya di dev.
    preview: {
      host: true,
      proxy,
    },
  }
})
