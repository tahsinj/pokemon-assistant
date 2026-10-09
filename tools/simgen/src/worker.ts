/** A simgen worker thread: plays its share of pairs and posts one JSON line per pair. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { searchBot } from '../../../src/renderer/src/engine/bots/search';
import { seededRandom } from '../../../src/renderer/src/engine/bots/random';
import { buildSmogonSetPool } from '../../../src/renderer/src/lib/battle/predictor/smogonPriors';
import { viewForFormat, type DexFile } from '../../../src/renderer/src/lib/data';
import { FORMATS, type FormatId } from '../../../src/renderer/src/lib/formats';
import type { SmogonBundle } from '../../../src/renderer/src/lib/smogon';
import { playPair } from './play';
import { SetSampler } from './sets';

export interface WorkerJob {
  root: string;
  format: FormatId;
  pairs: number;
  games: number;
  offMeta: number;
  seed: number;
}

const job = workerData as WorkerJob;
const read = <T>(path: string) => JSON.parse(readFileSync(join(job.root, 'src/renderer/public/data', path), 'utf8')) as T;
const view = viewForFormat(read<DexFile>('dex.json'), FORMATS[job.format]);
const usage = read<SmogonBundle>(`usage/${job.format}.json`);
const pool = buildSmogonSetPool(usage, view.pokemonById);
const sampler = new SetSampler(usage, pool, view.pokemonById);
const bots = [searchBot({}, pool), searchBot({}, pool)] as const;

for (let i = 0; i < job.pairs; i++) {
  const seed = job.seed + i * 101;
  const rand = seededRandom(seed);
  const a = sampler.sample(rand, job.offMeta);
  const b = sampler.sample(rand, job.offMeta);
  parentPort!.postMessage(JSON.stringify(playPair(job.format, a, b, [bots[0], bots[1]], job.games, seed)));
}
