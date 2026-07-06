import { describe, expect, it } from 'vitest';
import type { CvDetection, QuizItem } from '../api/contracts';
import {
  bunnyBinReducer,
  initialContext,
  resolveDetection,
  type MachineContext,
} from './bunnyBinMachine';

const quizBank: QuizItem[] = [
  {
    id: 'q-organik',
    category: 'organic',
    item_name: 'kulit pisang',
    image_url: 'data:,',
    explanation: 'membusuk jadi pupuk',
    active: true,
  },
  {
    id: 'q-anorganik',
    category: 'inorganic',
    item_name: 'botol plastik',
    image_url: 'data:,',
    explanation: 'bisa didaur ulang',
    active: true,
  },
  {
    id: 'q-nonaktif',
    category: 'organic',
    item_name: 'item nonaktif',
    image_url: 'data:,',
    explanation: '-',
    active: false,
  },
];

const pickFirst = <T,>(arr: T[]): T | undefined => arr[0];

const detection = (overrides: Partial<CvDetection> = {}): CvDetection => ({
  category: 'organic',
  confidence: 0.91,
  bbox: [100, 80, 300, 260],
  timestamp: '2026-07-06T00:00:00Z',
  ...overrides,
});

describe('resolveDetection — percabangan confidence (PRD-Software §4.3)', () => {
  it('confidence ≥ 0.85 → mode cv, kategori CV jadi jawaban benar', () => {
    const result = resolveDetection(detection({ category: 'inorganic' }), quizBank, pickFirst);
    expect(result.mode).toBe('cv');
    expect(result.correctCategory).toBe('inorganic');
    expect(result.quizItem?.category).toBe('inorganic'); // item penjelasan sekategori
  });

  it('confidence 0.5 → mode manual, kategori CV TIDAK di-pre-fill', () => {
    const result = resolveDetection(detection({ confidence: 0.5 }), quizBank, pickFirst);
    expect(result.mode).toBe('manual');
    // jawaban benar datang dari bank soal, bukan dari deteksi CV
    expect(result.correctCategory).toBe(result.quizItem?.category);
    expect(result.quizItem?.id).toBe('q-organik');
  });

  it('kategori null (tidak ada objek / webcam tercabut) → mode manual', () => {
    const result = resolveDetection(
      detection({ category: null, confidence: 0, bbox: null }),
      quizBank,
      pickFirst,
    );
    expect(result.mode).toBe('manual');
  });

  it('item nonaktif tidak pernah terpilih', () => {
    const onlyInactive = quizBank.filter((i) => !i.active);
    const result = resolveDetection(detection({ confidence: 0.5 }), onlyInactive, pickFirst);
    expect(result.quizItem).toBeNull();
    expect(result.correctCategory).toBeNull();
  });
});

describe('bunnyBinReducer — transisi state', () => {
  it('IDLE + START → SCANNING', () => {
    const next = bunnyBinReducer(initialContext(), { type: 'START' });
    expect(next.state).toBe('SCANNING');
  });

  it('SCANNING + DETECTED → QUESTION dengan resolusi terpasang', () => {
    const scanning: MachineContext = { ...initialContext(), state: 'SCANNING' };
    const d = detection();
    const next = bunnyBinReducer(scanning, {
      type: 'DETECTED',
      detection: d,
      resolution: resolveDetection(d, quizBank, pickFirst),
    });
    expect(next.state).toBe('QUESTION');
    expect(next.mode).toBe('cv');
    expect(next.correctCategory).toBe('organic');
  });

  it('QUESTION + jawaban benar → SUCCESS, bintang bertambah', () => {
    const question: MachineContext = {
      ...initialContext(3),
      state: 'QUESTION',
      correctCategory: 'organic',
    };
    const next = bunnyBinReducer(question, { type: 'ANSWER', category: 'organic' });
    expect(next.state).toBe('SUCCESS');
    expect(next.stars).toBe(4);
    expect(next.isCorrect).toBe(true);
  });

  it('QUESTION + jawaban salah → ERROR, bintang tetap', () => {
    const question: MachineContext = {
      ...initialContext(3),
      state: 'QUESTION',
      correctCategory: 'organic',
    };
    const next = bunnyBinReducer(question, { type: 'ANSWER', category: 'inorganic' });
    expect(next.state).toBe('ERROR');
    expect(next.stars).toBe(3);
    expect(next.isCorrect).toBe(false);
  });

  it('SUCCESS + FINISH → kembali IDLE dengan konteks ronde direset', () => {
    const success: MachineContext = {
      ...initialContext(5),
      state: 'SUCCESS',
      correctCategory: 'organic',
      childAnswer: 'organic',
      isCorrect: true,
    };
    const next = bunnyBinReducer(success, { type: 'FINISH' });
    expect(next.state).toBe('IDLE');
    expect(next.correctCategory).toBeNull();
    expect(next.childAnswer).toBeNull();
    expect(next.stars).toBe(5); // bintang TIDAK ikut direset
  });

  it('DEVICE_LOST dari state manapun → DEVICE_UNREACHABLE, lalu pulih ke IDLE', () => {
    const question: MachineContext = { ...initialContext(), state: 'QUESTION' };
    const lost = bunnyBinReducer(question, { type: 'DEVICE_LOST' });
    expect(lost.state).toBe('DEVICE_UNREACHABLE');
    const recovered = bunnyBinReducer(lost, { type: 'DEVICE_RECOVERED' });
    expect(recovered.state).toBe('IDLE');
  });

  it('event di state yang salah diabaikan (ANSWER saat IDLE)', () => {
    const idle = initialContext();
    const next = bunnyBinReducer(idle, { type: 'ANSWER', category: 'organic' });
    expect(next).toBe(idle);
  });
});

describe('integrasi mock end-to-end (alur penuh, PRD-FE §7)', () => {
  it('idle → scanning → question → success dengan confidence tinggi', () => {
    let ctx = initialContext();
    ctx = bunnyBinReducer(ctx, { type: 'START' });
    const d = detection({ category: 'organic', confidence: 0.93 });
    ctx = bunnyBinReducer(ctx, {
      type: 'DETECTED',
      detection: d,
      resolution: resolveDetection(d, quizBank, pickFirst),
    });
    ctx = bunnyBinReducer(ctx, { type: 'ANSWER', category: 'organic' });
    expect(ctx.state).toBe('SUCCESS');
    ctx = bunnyBinReducer(ctx, { type: 'FINISH' });
    expect(ctx.state).toBe('IDLE');
    expect(ctx.stars).toBe(1);
  });
});
