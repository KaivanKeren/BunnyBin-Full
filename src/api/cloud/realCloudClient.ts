import type { ICloudClient, QuizItem, SyncPayload } from '../contracts';

/**
 * Implementasi asli — aktif di Fase B.
 * TODO(Fase B): verifikasi path endpoint terhadap PRD.md §9.2 begitu
 * Vercel Functions-nya benar-benar ditulis.
 */
export class RealCloudClient implements ICloudClient {
  constructor(private baseUrl: string) {}

  async getQuizBank(): Promise<QuizItem[]> {
    const res = await fetch(`${this.baseUrl}/api/quiz-bank`);
    if (!res.ok) throw new Error(`Cloud /api/quiz-bank gagal: ${res.status}`);
    return res.json();
  }

  async syncLogs(unitId: string, payload: SyncPayload): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/units/${unitId}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Cloud sync gagal: ${res.status}`);
  }
}
