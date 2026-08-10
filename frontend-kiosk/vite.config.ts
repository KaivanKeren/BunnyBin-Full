import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
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
  },
})
