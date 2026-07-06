import { useEffect } from 'react';
import type { Category, QuizItem } from '../../api/contracts';
import { CATEGORY_LABEL } from '../../data/quizItems';
import { Bunny } from '../shared/Bunny';

const AUTO_FINISH_MS = 10000;

interface ErrorScreenProps {
  correctCategory: Category | null;
  quizItem: QuizItem | null;
  onDone: () => void;
}

export function ErrorScreen({ correctCategory, quizItem, onDone }: ErrorScreenProps) {
  useEffect(() => {
    const id = setTimeout(onDone, AUTO_FINISH_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-rose-100 to-orange-50 p-8 text-center">
      <Bunny mood="sad" className="w-52" />
      <h1 className="text-5xl font-extrabold text-rose-600">Yah, belum tepat… 💪</h1>
      {correctCategory && (
        <p className="text-3xl font-bold text-slate-700">
          Yang benar: sampah{' '}
          <span className="text-emerald-600">{CATEGORY_LABEL[correctCategory]}</span>
        </p>
      )}

      {quizItem && (
        <p className="max-w-2xl rounded-3xl bg-white/80 p-6 text-2xl font-semibold text-slate-600 shadow">
          {quizItem.explanation}
        </p>
      )}

      <p className="text-xl font-semibold text-slate-500">
        Tidak apa-apa, sekarang kamu jadi tahu! Boni tetap bantu buang di tempat yang benar ya.
      </p>

      <button
        type="button"
        onClick={onDone}
        className="rounded-full bg-rose-500 px-10 py-4 text-2xl font-extrabold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        Coba lagi! 🐰
      </button>
    </div>
  );
}
