import { useEffect, useState } from 'react';
import { cvClient } from '../api';
import type { CvDetection } from '../api/contracts';

/**
 * Polling GET /detect tiap 200ms selama `active` (PRD-Software §4.2).
 * `ticks` = jumlah polling yang sudah terjadi (gagal pun dihitung), dipakai
 * layar scanning untuk menentukan kapan deteksi dianggap stabil.
 */
export function useCvDetection(active: boolean, pollMs = 200) {
  const [detection, setDetection] = useState<CvDetection | null>(null);
  const [ticks, setTicks] = useState(0);

  useEffect(() => {
    if (!active) {
      setDetection(null);
      setTicks(0);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await cvClient.detect();
        if (!cancelled) setDetection(next);
      } catch {
        // CV service mati → graceful degradation, detection tetap null
        if (!cancelled) setDetection(null);
      } finally {
        if (!cancelled) setTicks((t) => t + 1);
      }
    };

    void poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active, pollMs]);

  return { detection, ticks };
}
