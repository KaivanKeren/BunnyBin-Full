import type { Category, QuizItem } from '../../api/contracts';
import type { QuestionMode } from '../../machine/bunnyBinMachine';
import { Bunny } from '../shared/Bunny';

interface QuestionScreenProps {
  mode: QuestionMode;
  quizItem: QuizItem | null;
  onAnswer: (category: Category) => void;
}

export function QuestionScreen({ mode, quizItem, onAnswer }: QuestionScreenProps) {
  // Mode 'cv': kategori dari CV disimpan sebagai jawaban benar tapi TIDAK
  // ditampilkan — anak tetap harus menebak sendiri (PRD-Software §4.3).
  const showQuizItem = mode === 'manual' && quizItem !== null;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 bg-amber-50 p-8 text-center">
      <Bunny mood="curious" className="w-36" />

      {showQuizItem ? (
        <>
          <img src={quizItem.image_url} alt={quizItem.item_name} className="h-40 w-40" />
          <h1 className="max-w-3xl text-4xl leading-snug font-extrabold text-slate-700">
            Kalau <span className="text-amber-600">{quizItem.item_name}</span>, masuk tempat
            sampah yang mana ya?
          </h1>
        </>
      ) : (
        <h1 className="max-w-3xl text-4xl leading-snug font-extrabold text-slate-700">
          Menurutmu, sampah yang kamu pegang itu sampah apa?
        </h1>
      )}

      <div className="flex flex-wrap justify-center gap-8">
        <button
          type="button"
          onClick={() => onAnswer('organic')}
          className="rounded-3xl bg-emerald-500 px-12 py-8 text-4xl font-extrabold text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        >
          🍃 Organik
        </button>
        <button
          type="button"
          onClick={() => onAnswer('inorganic')}
          className="rounded-3xl bg-sky-500 px-12 py-8 text-4xl font-extrabold text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
        >
          🧴 Anorganik
        </button>
      </div>
    </div>
  );
}
