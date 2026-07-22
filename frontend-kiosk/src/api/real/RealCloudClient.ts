// src/api/real/RealCloudClient.ts
// axios ke Laravel (Sanctum token per-unit ability 'kiosk', §6). Header Bearer di @/api/http.
// Endpoint per PRD-Backend-Laravel.md §3 + addendum §7. cv/classify sudah auth:sanctum di backend.
import type {
  CvDetection,
  FillAck,
  FillReport,
  ICloudClient,
  QuizItem,
  SortLogPayload,
} from '@/api/contracts'
import { config } from '@/api/config'
import { api } from '@/api/http'

export class RealCloudClient implements ICloudClient {
  /** Semua rute ingest di-scope per unit — token unit A tidak bisa menulis unit B (§7). */
  private get unitPath(): string {
    return `/units/${config.unitCode}`
  }

  async getQuizBank(): Promise<QuizItem[]> {
    // Endpoint ini paginated (default 15). Kiosk butuh seluruh bank aktif
    // sekaligus, bukan halaman pertama saja.
    const { data } = await api.get<{ data: QuizItem[] }>('/quiz-items', {
      params: { active: 1, per_page: 100 },
    })
    return data.data
  }

  async classify(imageBase64: string): Promise<CvDetection> {
    // Field harus `image_base64` — `image` di backend divalidasi sebagai file upload
    // (CvProxyController), bukan string base64.
    const { data } = await api.post<CvDetection>('/cv/classify', { image_base64: imageBase64 })
    return data
  }

  async logSort(payload: SortLogPayload): Promise<void> {
    await api.post(`${this.unitPath}/sort-logs`, payload)
  }

  async reportFill(report: FillReport): Promise<FillAck> {
    const { data } = await api.post<FillAck>(`${this.unitPath}/fill`, report)
    return data
  }

  async heartbeat(): Promise<void> {
    await api.post(`${this.unitPath}/heartbeat`)
  }
}
