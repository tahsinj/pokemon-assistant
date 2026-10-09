/** Plays verification games off the UI thread. See verifyClient.ts. */
import type { RaidRules } from '../lib/raid';
import { playRaid, playTeams } from './verify';

export type VerifyJob =
  | { kind: 'teams'; format: string; teamA: string; teamB: string; seeds: number[] }
  | { kind: 'raid'; member: string; boss: string; rules: RaidRules; seeds: number[] };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<VerifyJob>) => void) | null;
  postMessage(message: { score: number } | { error: string }): void;
};

scope.onmessage = (e) => {
  const job = e.data;
  for (const seed of job.seeds) {
    try {
      const score = job.kind === 'teams' ? playTeams(job.format, job.teamA, job.teamB, seed) : playRaid(job.member, job.boss, job.rules, seed).score;
      scope.postMessage({ score });
    } catch (err) {
      scope.postMessage({ error: err instanceof Error ? err.message : String(err) });
    }
  }
};
