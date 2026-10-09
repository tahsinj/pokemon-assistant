/** A teamproof worker: plays its share of games and posts each result. */
import { parentPort, workerData } from 'node:worker_threads';
import { playTeams } from '../../../src/renderer/src/engine/verify';

export interface ProofJob {
  format: string;
  teams: Record<'classic' | 'model', string>;
  opponents: string[];
  games: { which: 'classic' | 'model'; opponent: number; seed: number }[];
}

const job = workerData as ProofJob;
for (const g of job.games) {
  const score = playTeams(job.format, job.teams[g.which], job.opponents[g.opponent], g.seed);
  parentPort!.postMessage({ ...g, score });
}
