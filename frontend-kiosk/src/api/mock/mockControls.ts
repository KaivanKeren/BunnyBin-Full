// src/api/mock/mockControls.ts
// Toggle & override yang dikendalikan Debug Panel (§9). Singleton modul supaya
// panel bisa mengatur perilaku mock tanpa memegang referensi instance.
import type { CvDetection } from '@/api/contracts'

export interface MockControls {
  nextDetection: CvDetection | null // one-shot override hasil CV berikutnya
  esp32Offline: boolean // simulasi ESP32 lokal tak terjangkau
  cloudOffline: boolean // simulasi Laravel cloud tak terjangkau
}

export const mockControls: MockControls = {
  nextDetection: null,
  esp32Offline: false,
  cloudOffline: false,
}
