import type { Esp32Status } from '../../api/contracts';
import { Bunny } from '../shared/Bunny';

interface IdleScreenProps {
  status: Esp32Status | null;
  onStart: () => void;
}

function FillBar({ label, pct, barClass }: { label: string; pct: number; barClass: string }) {
  return (
    <div className="flex w-64 flex-col gap-1">
      <div className="flex justify-between text-sm font-bold text-slate-600">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-white/70">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function fillAlert(status: Esp32Status): string | null {
  const worst = Math.max(status.organic, status.inorganic);
  const which =
    status.organic >= status.inorganic ? 'kotak sampah organik' : 'kotak sampah anorganik';
  if (worst >= 90) return `Waduh, ${which} sudah penuh! Tolong panggil Bapak/Ibu Guru ya 🙏`;
  if (worst >= 70) return `Psst, ${which} hampir penuh nih!`;
  return null;
}

export function IdleScreen({ status, onStart }: IdleScreenProps) {
  const alert = status ? fillAlert(status) : null;

  return (
    <button
      type="button"
      onClick={onStart}
      className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-6 bg-gradient-to-b from-sky-200 to-emerald-100 p-8 text-center"
    >
      {alert && (
        <div
          className={`absolute top-6 left-1/2 -translate-x-1/2 rounded-2xl px-6 py-3 text-lg font-bold text-white shadow-lg ${
            alert.includes('penuh!') ? 'animate-pulse bg-rose-500' : 'bg-amber-500'
          }`}
        >
          {alert}
        </div>
      )}

      <Bunny mood="happy" className="w-56 animate-[float_3s_ease-in-out_infinite]" />
      <h1 className="text-5xl font-extrabold text-emerald-700">Hai! Aku Boni! 🐰</h1>
      <p className="text-2xl font-semibold text-slate-600">
        Ayo buang sampahmu di sini!
        <br />
        Sentuh layar untuk mulai ✨
      </p>

      {status && (
        <div className="mt-6 flex flex-wrap justify-center gap-6">
          <FillBar label="🍃 Organik" pct={status.organic} barClass="bg-emerald-500" />
          <FillBar label="🧴 Anorganik" pct={status.inorganic} barClass="bg-sky-500" />
        </div>
      )}
    </button>
  );
}
