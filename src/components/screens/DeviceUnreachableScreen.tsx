import { Bunny } from '../shared/Bunny';

/** State baru sesuai PRD.md UI-09 — ESP32 tidak merespons. */
export function DeviceUnreachableScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-slate-800 p-8 text-center">
      <Bunny mood="sleepy" className="w-52 opacity-90" />
      <h1 className="text-5xl font-extrabold text-white">Tempat sampahnya lagi tidur 😴</h1>
      <p className="max-w-2xl text-2xl font-semibold text-slate-300">
        Boni tidak bisa menghubungi tempat sampah. Tolong panggil Bapak/Ibu Guru untuk memeriksa
        kabel dan WiFi-nya ya!
      </p>
      <div className="mt-4 flex items-center gap-3 text-slate-400">
        <span className="h-4 w-4 animate-ping rounded-full bg-lime-400" />
        <span className="text-lg font-semibold">Boni terus mencoba menghubungi…</span>
      </div>
    </div>
  );
}
