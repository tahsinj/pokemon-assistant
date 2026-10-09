/**
 * Runs verification games across a few workers and reports the running
 * score. Without workers it does nothing and says so; a page thread can't
 * play hundreds of battles without freezing.
 */
import { wilson } from './wilson';
import type { VerifyJob } from './verify.worker';

export interface VerifyProgress {
  games: number;
  total: number;
  /** Team A's score so far (wins 1, ties 0.5). */
  score: number;
  /** 95% interval for the win rate. */
  low: number;
  high: number;
  error?: string;
  /** Stopped by the user before `total` games. */
  stopped?: boolean;
}

/** Start `total` games; returns a stop function. `onProgress` fires after every game. */
export function runVerify(
  job: Omit<VerifyJob, 'seeds'>,
  total: number,
  onProgress: (p: VerifyProgress) => void,
  firstSeed = 1,
): () => void {
  const count = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1, total));
  const workers: Worker[] = [];
  let games = 0;
  let score = 0;
  const stop = () => workers.forEach((w) => w.terminate());
  const report = (error?: string) => {
    const [low, high] = games ? wilson(score, games) : [0, 1];
    onProgress({ games, total, score, low, high, error });
  };
  try {
    for (let w = 0; w < count; w++) {
      const seeds = Array.from({ length: total }, (_, i) => firstSeed + i).filter((_, i) => i % count === w);
      const worker = new Worker(new URL('./verify.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ score: number } | { error: string }>) => {
        if ('error' in e.data) return report(e.data.error);
        games++;
        score += e.data.score;
        report();
        if (games >= total) stop();
      };
      worker.onerror = () => report('A verification worker stopped.');
      worker.postMessage({ ...job, seeds } satisfies VerifyJob);
      workers.push(worker);
    }
  } catch {
    stop();
    report('This window cannot start background workers, so verification is off.');
  }
  return stop;
}
