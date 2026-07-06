import type { Category, Esp32Status, IEsp32Client, SortRequest, SortResponse } from '../contracts';

/**
 * Implementasi asli — aktif di Fase A. Endpoint mengikuti PRD.md §9.1
 * (GET /api/status, POST /api/sort, POST /api/sim/drop, POST /api/sim/reset).
 */
export class RealEsp32Client implements IEsp32Client {
  constructor(private host: string) {}

  async getStatus(): Promise<Esp32Status> {
    const res = await fetch(`${this.host}/api/status`);
    if (!res.ok) throw new Error(`ESP32 /api/status gagal: ${res.status}`);
    return res.json();
  }

  async sort(req: SortRequest): Promise<SortResponse> {
    const res = await fetch(`${this.host}/api/sort`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!res.ok) throw new Error(`ESP32 /api/sort gagal: ${res.status}`);
    return res.json();
  }

  async simDrop(compartment: Category, amount: number): Promise<void> {
    await fetch(`${this.host}/api/sim/drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ compartment, amount }),
    });
  }

  async simReset(): Promise<void> {
    await fetch(`${this.host}/api/sim/reset`, { method: 'POST' });
  }
}
