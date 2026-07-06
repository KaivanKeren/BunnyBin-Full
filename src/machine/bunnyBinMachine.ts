// State machine kiosk — implementasi diagram PRD-Software.md §4.3.
// Mengikuti rekomendasi PRD-FE §6.1: mulai dengan `useReducer` polos untuk MVP,
// migrasi ke XState direncanakan begitu integrasi CV asli (Fase C) mulai.

import type { Category, CvDetection, QuizItem } from '../api/contracts';

export const CONFIDENCE_THRESHOLD = 0.85;

export type BunnyState =
  | 'IDLE'
  | 'SCANNING'
  | 'QUESTION'
  | 'SUCCESS'
  | 'ERROR'
  | 'DEVICE_UNREACHABLE';

/**
 * 'cv'     → confidence tinggi: kategori dari CV disimpan sebagai jawaban benar,
 *            TIDAK ditampilkan ke anak — anak tetap harus menebak.
 * 'manual' → fallback confidence rendah / tidak ada objek: tanya lewat item
 *            bank soal, persis prototype tanpa CV.
 */
export type QuestionMode = 'cv' | 'manual';

export interface DetectionResolution {
  mode: QuestionMode;
  correctCategory: Category | null;
  quizItem: QuizItem | null;
}

function randomPick<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

/**
 * Percabangan confidence (PRD-Software §4.3). Dipisah dari reducer supaya
 * bisa diuji deterministik dengan `pick` yang di-inject.
 */
export function resolveDetection(
  detection: CvDetection,
  quizBank: QuizItem[],
  pick: <T>(arr: T[]) => T | undefined = randomPick,
): DetectionResolution {
  const activeItems = quizBank.filter((item) => item.active);

  if (detection.category !== null && detection.confidence >= CONFIDENCE_THRESHOLD) {
    // Item bank soal sekategori dipakai untuk teks penjelasan di layar hasil.
    const explanationItem =
      pick(activeItems.filter((item) => item.category === detection.category)) ?? null;
    return { mode: 'cv', correctCategory: detection.category, quizItem: explanationItem };
  }

  // Fallback: kategori tidak di-pre-fill dari CV — jawaban benar datang dari bank soal.
  const quizItem = pick(activeItems) ?? null;
  return { mode: 'manual', correctCategory: quizItem?.category ?? null, quizItem };
}

export interface MachineContext {
  state: BunnyState;
  mode: QuestionMode;
  detection: CvDetection | null;
  correctCategory: Category | null;
  quizItem: QuizItem | null;
  childAnswer: Category | null;
  isCorrect: boolean | null;
  stars: number;
}

export type MachineEvent =
  | { type: 'START' }
  | { type: 'DETECTED'; detection: CvDetection; resolution: DetectionResolution }
  | { type: 'ANSWER'; category: Category }
  | { type: 'FINISH' }
  | { type: 'DEVICE_LOST' }
  | { type: 'DEVICE_RECOVERED' }
  | { type: 'RESET_STARS' }
  | { type: 'FORCE'; state: BunnyState };

export function initialContext(stars = 0): MachineContext {
  return {
    state: 'IDLE',
    mode: 'manual',
    detection: null,
    correctCategory: null,
    quizItem: null,
    childAnswer: null,
    isCorrect: null,
    stars,
  };
}

const ROUND_RESET = {
  mode: 'manual' as QuestionMode,
  detection: null,
  correctCategory: null,
  quizItem: null,
  childAnswer: null,
  isCorrect: null,
};

export function bunnyBinReducer(ctx: MachineContext, event: MachineEvent): MachineContext {
  switch (event.type) {
    case 'DEVICE_LOST':
      return { ...ctx, state: 'DEVICE_UNREACHABLE' };

    case 'DEVICE_RECOVERED':
      return ctx.state === 'DEVICE_UNREACHABLE'
        ? { ...ctx, ...ROUND_RESET, state: 'IDLE' }
        : ctx;

    case 'START':
      return ctx.state === 'IDLE' ? { ...ctx, ...ROUND_RESET, state: 'SCANNING' } : ctx;

    case 'DETECTED':
      return ctx.state === 'SCANNING'
        ? { ...ctx, state: 'QUESTION', detection: event.detection, ...event.resolution }
        : ctx;

    case 'ANSWER': {
      if (ctx.state !== 'QUESTION') return ctx;
      // Tanpa jawaban benar (bank soal kosong + CV tidak yakin) anggap benar —
      // jangan pernah menyalahkan anak karena data kita yang kurang.
      const isCorrect =
        ctx.correctCategory === null ? true : event.category === ctx.correctCategory;
      return {
        ...ctx,
        state: isCorrect ? 'SUCCESS' : 'ERROR',
        childAnswer: event.category,
        isCorrect,
        stars: isCorrect ? ctx.stars + 1 : ctx.stars,
      };
    }

    case 'FINISH':
      return ctx.state === 'SUCCESS' || ctx.state === 'ERROR'
        ? { ...ctx, ...ROUND_RESET, state: 'IDLE' }
        : ctx;

    case 'RESET_STARS':
      return { ...ctx, stars: 0 };

    case 'FORCE':
      return { ...ctx, state: event.state };
  }
}
