import { useEffect, useState } from 'react';
import { cloudClient } from '../api';
import type { QuizItem } from '../api/contracts';

/** Ambil bank soal sekali saat mount. Cloud boleh gagal — fallback array kosong. */
export function useQuizBank(): QuizItem[] {
  const [items, setItems] = useState<QuizItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    cloudClient
      .getQuizBank()
      .then((bank) => {
        if (!cancelled) setItems(bank);
      })
      .catch(() => {
        // best-effort: kiosk tetap jalan tanpa bank soal dari cloud
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return items;
}
