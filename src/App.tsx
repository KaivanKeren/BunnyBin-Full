import { useCallback, useEffect, useReducer, useState } from 'react';
import { cloudClient, esp32Client } from './api';
import type { Category, CvDetection } from './api/contracts';
import {
  bunnyBinReducer,
  initialContext,
  resolveDetection,
} from './machine/bunnyBinMachine';
import { useEsp32Status } from './hooks/useEsp32Status';
import { useQuizBank } from './hooks/useQuizBank';
import { IdleScreen } from './components/screens/IdleScreen';
import { ScanningScreen } from './components/screens/ScanningScreen';
import { QuestionScreen } from './components/screens/QuestionScreen';
import { SuccessScreen } from './components/screens/SuccessScreen';
import { ErrorScreen } from './components/screens/ErrorScreen';
import { DeviceUnreachableScreen } from './components/screens/DeviceUnreachableScreen';
import { StarCounter } from './components/shared/StarCounter';
import { DebugPanel } from './dev/DebugPanel';

const STARS_KEY = 'bunnybin.stars';
const UNIT_ID = 'unit-proto-1';

export default function App() {
  const [ctx, dispatch] = useReducer(bunnyBinReducer, undefined, () =>
    initialContext(Number(localStorage.getItem(STARS_KEY)) || 0),
  );
  const quizBank = useQuizBank();
  const { status, unreachable } = useEsp32Status();
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    localStorage.setItem(STARS_KEY, String(ctx.stars));
  }, [ctx.stars]);

  // ESP32 hilang/kembali → transisi DEVICE_UNREACHABLE (PRD.md UI-09)
  useEffect(() => {
    if (unreachable && ctx.state !== 'DEVICE_UNREACHABLE') {
      dispatch({ type: 'DEVICE_LOST' });
    } else if (!unreachable && ctx.state === 'DEVICE_UNREACHABLE') {
      dispatch({ type: 'DEVICE_RECOVERED' });
    }
  }, [unreachable, ctx.state]);

  // Toggle Debug Panel: Ctrl+Shift+D (dev only, PRD-FE §5.5)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setShowDebug((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleDetected = useCallback(
    (detection: CvDetection) => {
      dispatch({
        type: 'DETECTED',
        detection,
        resolution: resolveDetection(detection, quizBank),
      });
    },
    [quizBank],
  );

  const handleAnswer = useCallback(
    (category: Category) => {
      // Servo selalu ikut kategori yang benar (dari CV/bank soal), terlepas
      // dari jawaban anak — akurat secara fisik (PRD-Software §4.3).
      const sortTarget = ctx.correctCategory ?? category;
      const isCorrect = ctx.correctCategory === null ? true : category === ctx.correctCategory;
      dispatch({ type: 'ANSWER', category });

      esp32Client.sort({ category: sortTarget }).catch((err) => {
        console.warn('Sort gagal (best-effort):', err);
      });

      if (ctx.quizItem) {
        cloudClient
          .syncLogs(UNIT_ID, {
            sort_logs: [
              {
                quiz_item_id: ctx.quizItem.id,
                is_correct: isCorrect,
                created_at: new Date().toISOString(),
              },
            ],
            fill_snapshots: status
              ? [
                  {
                    organic_pct: status.organic,
                    inorganic_pct: status.inorganic,
                    recorded_at: new Date().toISOString(),
                  },
                ]
              : [],
          })
          .catch(() => {
            // cloud best-effort, boleh gagal (PRD-Software §2)
          });
      }
    },
    [ctx.correctCategory, ctx.quizItem, status],
  );

  const handleFinish = useCallback(() => dispatch({ type: 'FINISH' }), []);

  return (
    <div className="relative h-dvh w-full overflow-hidden select-none">
      {ctx.state === 'IDLE' && (
        <IdleScreen status={status} onStart={() => dispatch({ type: 'START' })} />
      )}
      {ctx.state === 'SCANNING' && <ScanningScreen onDetected={handleDetected} />}
      {ctx.state === 'QUESTION' && (
        <QuestionScreen mode={ctx.mode} quizItem={ctx.quizItem} onAnswer={handleAnswer} />
      )}
      {ctx.state === 'SUCCESS' && <SuccessScreen quizItem={ctx.quizItem} onDone={handleFinish} />}
      {ctx.state === 'ERROR' && (
        <ErrorScreen
          correctCategory={ctx.correctCategory}
          quizItem={ctx.quizItem}
          onDone={handleFinish}
        />
      )}
      {ctx.state === 'DEVICE_UNREACHABLE' && <DeviceUnreachableScreen />}

      {ctx.state !== 'DEVICE_UNREACHABLE' && <StarCounter count={ctx.stars} />}

      {import.meta.env.DEV && showDebug && <DebugPanel ctx={ctx} dispatch={dispatch} />}
    </div>
  );
}
