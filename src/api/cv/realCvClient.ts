import type { CvDetection, ICvClient } from '../contracts';

/**
 * Implementasi asli — aktif di Fase C. Endpoint mengikuti PRD-Software.md §4.2
 * (GET http://localhost:8001/detect).
 */
export class RealCvClient implements ICvClient {
  constructor(private baseUrl: string) {}

  async detect(): Promise<CvDetection> {
    const res = await fetch(`${this.baseUrl}/detect`);
    if (!res.ok) throw new Error(`CV service /detect gagal: ${res.status}`);
    return res.json();
  }
}
