import { useEffect, useRef, useState } from 'react';
import { esp32Client } from '../api';
import type { Esp32Status } from '../api/contracts';

const FAILURES_BEFORE_UNREACHABLE = 3;

/** Polling GET /api/status tiap 500ms (PRD-Software §4.2). */
export function useEsp32Status(pollMs = 500) {
  const [status, setStatus] = useState<Esp32Status | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const failCount = useRef(0);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const next = await esp32Client.getStatus();
        if (cancelled) return;
        failCount.current = 0;
        setStatus(next);
        setUnreachable(false);
      } catch {
        if (cancelled) return;
        failCount.current += 1;
        if (failCount.current >= FAILURES_BEFORE_UNREACHABLE) setUnreachable(true);
      }
    };

    void poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [pollMs]);

  return { status, unreachable };
}
