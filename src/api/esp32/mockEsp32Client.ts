import type { Category, Esp32Status, IEsp32Client, SortRequest, SortResponse } from '../contracts';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mensimulasikan sensor yang naik perlahan seiring waktu (supaya alert 70%/90%
 * bisa diuji tanpa nunggu asli) dan servo yang "bergerak" dengan delay realistis.
 */
export class MockEsp32Client implements IEsp32Client {
  private organic = 20;
  private inorganic = 35;

  /** Khusus Debug Panel: simulasi ESP32 mati/tidak terjangkau (UI-09). */
  public offline = false;

  async getStatus(): Promise<Esp32Status> {
    if (this.offline) throw new Error('ESP32 offline (simulasi)');
    // naik sedikit tiap dipanggil, mensimulasikan pemakaian nyata
    this.organic = Math.min(100, this.organic + Math.random() * 0.5);
    this.inorganic = Math.min(100, this.inorganic + Math.random() * 0.5);
    return {
      organic: Math.round(this.organic),
      inorganic: Math.round(this.inorganic),
      servo_pos: 'idle',
    };
  }

  async sort(req: SortRequest): Promise<SortResponse> {
    if (this.offline) throw new Error('ESP32 offline (simulasi)');
    await delay(400); // simulasi waktu servo bergerak
    return { status: 'ok', servo_pos: req.category };
  }

  async simDrop(compartment: Category, amount: number): Promise<void> {
    if (compartment === 'organic') this.organic = Math.min(100, this.organic + amount);
    else this.inorganic = Math.min(100, this.inorganic + amount);
  }

  async simReset(): Promise<void> {
    this.organic = 0;
    this.inorganic = 0;
  }

  /** Khusus Debug Panel: set level pengisian langsung (uji alert 70%/90% instan). */
  simSetLevels(organic: number, inorganic: number): void {
    this.organic = Math.max(0, Math.min(100, organic));
    this.inorganic = Math.max(0, Math.min(100, inorganic));
  }
}
