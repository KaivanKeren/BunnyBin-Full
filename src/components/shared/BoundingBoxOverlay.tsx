import type { CvDetection } from '../../api/contracts';
import { CATEGORY_LABEL } from '../../data/quizItems';

interface BoundingBoxOverlayProps {
  detection: CvDetection | null;
  /** Dimensi frame kamera asal koordinat bbox (default 640×480). */
  frameWidth?: number;
  frameHeight?: number;
}

/** Kotak deteksi live di atas viewport kamera. Koordinat bbox: [x1, y1, x2, y2]. */
export function BoundingBoxOverlay({
  detection,
  frameWidth = 640,
  frameHeight = 480,
}: BoundingBoxOverlayProps) {
  if (!detection || !detection.bbox || detection.category === null) return null;

  const [x1, y1, x2, y2] = detection.bbox;
  const style = {
    left: `${(x1 / frameWidth) * 100}%`,
    top: `${(y1 / frameHeight) * 100}%`,
    width: `${((x2 - x1) / frameWidth) * 100}%`,
    height: `${((y2 - y1) / frameHeight) * 100}%`,
  };

  return (
    <div
      data-testid="bounding-box"
      className="pointer-events-none absolute rounded-lg border-4 border-lime-400"
      style={style}
    >
      <span className="absolute -top-9 left-0 rounded-md bg-lime-400 px-2 py-1 text-sm font-bold whitespace-nowrap text-slate-900">
        {CATEGORY_LABEL[detection.category]} {Math.round(detection.confidence * 100)}%
      </span>
    </div>
  );
}
