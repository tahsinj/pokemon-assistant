/** Plays verification games off the UI thread. See verifyClient.ts. */
import { playTeams } from './verify';

export interface VerifyJob {
  format: string;
  teamA: string;
  teamB: string;
  seeds: number[];
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<VerifyJob>) => void) | null;
  postMessage(message: { score: number } | { error: string }): void;
};

scope.onmessage = (e) => {
  const { format, teamA, teamB, seeds } = e.data;
  for (const seed of seeds) {
    try {
      scope.postMessage({ score: playTeams(format, teamA, teamB, seed) });
    } catch (err) {
      scope.postMessage({ error: err instanceof Error ? err.message : String(err) });
    }
  }
};
