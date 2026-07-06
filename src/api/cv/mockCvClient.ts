import type { CvDetection, ICvClient } from '../contracts';

const DEFAULT_BBOX: [number, number, number, number] = [100, 80, 300, 260];

/**
 * Mock CV — memungkinkan seluruh percabangan confidence tinggi/rendah
 * (PRD-Software.md §4.3) diuji tanpa webcam atau model apapun.
 */
export class MockCvClient implements ICvClient {
  // dikontrol lewat Debug Panel (§5.5), default: deteksi acak confidence tinggi
  public override: Partial<CvDetection> | null = null;

  async detect(): Promise<CvDetection> {
    if (this.override) {
      // `category` boleh sengaja null (simulasi "tidak ada objek", PRD-Software §4.4)
      const category = 'category' in this.override ? (this.override.category ?? null) : 'organic';
      return {
        category,
        confidence: this.override.confidence ?? 0.9,
        bbox: category === null ? null : (this.override.bbox ?? DEFAULT_BBOX),
        timestamp: new Date().toISOString(),
      };
    }
    // default: simulasikan deteksi normal
    return {
      category: Math.random() > 0.5 ? 'organic' : 'inorganic',
      confidence: 0.85 + Math.random() * 0.14,
      bbox: DEFAULT_BBOX,
      timestamp: new Date().toISOString(),
    };
  }
}
