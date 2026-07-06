import { useEffect } from 'react';
import type { QuizItem } from '../../api/contracts';
import { Bunny } from '../shared/Bunny';

const AUTO_FINISH_MS = 8000;

interface SuccessScreenProps {
  quizItem: QuizItem | null;
  onDone: () => void;
}

export function SuccessScreen({ quizItem, onDone }: SuccessScreenProps) {
  useEffect(() => {
    const id = setTimeout(onDone, AUTO_FINISH_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-gradient-to-b from-emerald-200 to-lime-100 p-8 text-center">
      <Bunny mood="happy" className="w-52 animate-[wiggle_0.6s_ease-in-out_3]" />
      <h1 className="text-6xl font-extrabold text-emerald-700">Hore, kamu benar! 🎉</h1>
      <p className="text-3xl font-bold text-amber-500">+1 bintang untukmu ⭐</p>

      {quizItem && (
        <p className="max-w-2xl rounded-3xl bg-white/80 p-6 text-2xl font-semibold text-slate-600 shadow">
          {quizItem.explanation}
        </p>
      )}

      <button
        type="button"
        onClick={onDone}
        className="rounded-full bg-emerald-600 px-10 py-4 text-2xl font-extrabold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
      >
        Selesai! 🐰
      </button>
    </div>
  );
}
