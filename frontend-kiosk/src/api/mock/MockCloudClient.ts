// src/api/mock/MockCloudClient.ts
// Simulasi Laravel cloud (§8). classify() = proxy CV (folded ke cloud sesuai §5:
// "CV service tidak pernah dipanggil langsung dari device, Laravel selalu orchestrator").
import type { CvDetection, ICloudClient, QuizItem, SortLogPayload } from '@/api/contracts'
import quizBankRaw from '@/mocks/quizBank.json'
import { generateDetection } from './generateDetection'
import { mockControls } from './mockControls'

const quizBank = quizBankRaw as unknown as QuizItem[]
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class MockCloudClient implements ICloudClient {
  /** Log terkirim (sukses) — inspectable dari Debug Panel. */
  readonly sentLogs: SortLogPayload[] = []

  async getQuizBank(): Promise<QuizItem[]> {
    if (mockControls.cloudOffline) throw new Error('cloud offline (mock)')
    await delay(200)
    return quizBank.filter((q) => q.active)
  }

  async classify(_imageBase64: string): Promise<CvDetection> {
    if (mockControls.cloudOffline) throw new Error('cloud offline (mock)')
    await delay(1200) // simulasi inferensi CV + latency jaringan
    if (mockControls.nextDetection) {
      const forced = mockControls.nextDetection
      mockControls.nextDetection = null // one-shot override
      return forced
    }
    return generateDetection()
  }

  async logSort(payload: SortLogPayload): Promise<void> {
    if (mockControls.cloudOffline) throw new Error('cloud offline (mock)')
    await delay(150)
    this.sentLogs.push(payload)
    console.info('[MockCloud] logSort →', payload)
  }
}
