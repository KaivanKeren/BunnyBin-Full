import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Test unit murni — tanpa jsdom, tanpa React. Logika yang diuji sengaja
// diekstrak dari komponen supaya bisa diverifikasi tanpa merender apa pun.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
