import { useEffect, useRef } from 'react';
import type { CvDetection } from '../../api/contracts';
import { CONFIDENCE_THRESHOLD } from '../../machine/bunnyBinMachine';
import { useCvDetection } from '../../hooks/useCvDetection';
import { Bunny } from '../shared/Bunny';
import { BoundingBoxOverlay } from '../shared/BoundingBoxOverlay';

// @200ms: ±2 detik memandang objek sebelum memutuskan
const STABLE_TICKS = 10;
// kalau CV service tidak pernah menjawab, menyerah dan fallback manual (§4.4)
const GIVE_UP_TICKS = 25;

interface ScanningScreenProps {
  onDetected: (detection: CvDetection) => void;
}

export function ScanningScreen({ onDetected }: ScanningScreenProps) {
  const { detection, ticks } = useCvDetection(true);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (ticks >= STABLE_TICKS && detection) {
      fired.current = true;
      onDetected(detection);
    } else if (ticks >= GIVE_UP_TICKS) {
      fired.current = true;
      onDetected({
        category: null,
        confidence: 0,
        bbox: null,
        timestamp: new Date().toISOString(),
      });
    }
  }, [ticks, detection, onDetected]);

  // bounding box hanya saat confidence tinggi (PRD-Software §4.4)
  const confident = detection !== null && detection.confidence >= CONFIDENCE_THRESHOLD;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-slate-900 p-8 text-center">
      <div className="flex items-center gap-4">
        <Bunny mood="curious" className="w-24" />
        <p className="animate-pulse text-3xl font-bold text-white">
          Hmm, Boni lagi melihat sampahmu…
        </p>
      </div>

      {/* viewport kamera (mock) */}
      <div className="relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-3xl border-4 border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800 shadow-2xl">
        <div className="absolute inset-x-0 h-1 animate-[scanline_2s_linear_infinite] bg-lime-400/70" />
        <BoundingBoxOverlay detection={confident ? detection : null} />
        <span className="absolute right-3 bottom-2 text-xs font-semibold tracking-widest text-slate-400 uppercase">
          kamera
        </span>
      </div>
    </div>
  );
}
