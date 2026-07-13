// src/api/real/RealCloudClient.ts
// axios ke Laravel (Sanctum token per-unit ability 'kiosk', §6). Header Bearer di @/api/http.
// Endpoint per PRD-Backend-Laravel.md §3 + addendum §7. cv/classify sudah auth:sanctum di backend.
import type { CvDetection, ICloudClient, QuizItem, SortLogPayload } from '@/api/contracts'
import { config } from '@/api/config'
import { api } from '@/api/http'

export class RealCloudClient implements ICloudClient {
  async getQuizBank(): Promise<QuizItem[]> {
    const { data } = await api.get<{ data: QuizItem[] }>('/quiz-items')
    return data.data
  }

  async classify(imageBase64: string): Promise<CvDetection> {
    const { data } = await api.post<CvDetection>('/cv/classify', { image: imageBase64 })
    return data
  }

  async logSort(payload: SortLogPayload): Promise<void> {
    // §7 addendum: scoped per unit_code, token unit A tidak bisa post ke unit B.
    await api.post(`/units/${config.unitCode}/sort-logs`, payload)
  }
}
