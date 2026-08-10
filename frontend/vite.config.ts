import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Port DITETAPKAN, tidak dibiarkan default. Kedua frontend sama-sama default
  // ke 5173, jadi menjalankannya bersamaan menggeser salah satunya ke 5174
  // secara kebetulan — sementara config/cors.php dan SANCTUM_STATEFUL_DOMAINS
  // mengandaikan pembagian TETAP: 5173 = dashboard admin.
  server: {
    port: 5173,
    strictPort: true,
  },
})
