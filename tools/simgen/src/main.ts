/**
 * Generates labelled one-on-one battles for the matchup model.
 *
 * Usage: npm run simgen -- [--format gen9ou] [--pairs 1000] [--games 4]
 *        [--offmeta 0.25] [--workers 8] [--seed 1] [--out ml/data/sim/<format>.jsonl]
 *        npm run simgen -- --checks [--format gen9ou]
 *
 * --checks writes feature rows for Smogon's checks and counters to
 * ml/data/sim/<format>.checks.jsonl instead of playing games.
 */
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { FEATURE_NAMES } from '../../../src/renderer/src/ml/matchupFeatures';
import { FORMAT_ORDER, type FormatId } from '../../../src/renderer/src/lib/formats';
import type { WorkerJob } from './worker';
import { buildSmogonSetPool } from '../../../src/renderer/src/lib/battle/predictor/smogonPriors';
import { viewForFormat, type DexFile } from '../../../src/renderer/src/lib/data';
import { FORMATS } from '../../../src/renderer/src/lib/formats';
import type { SmogonBundle } from '../../../src/renderer/src/lib/smogon';
import { checkRows } from './checks';

function option(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

export async function run(args: string[], workerFile: string): Promise<void> {
  const format = option(args, 'format', 'gen9ou') as FormatId;
  if (!FORMAT_ORDER.includes(format)) throw new Error(`Unknown format ${format}; use one of ${FORMAT_ORDER.join(', ')}.`);
  if (args.includes('--checks')) {
    const read = <T>(path: string) => JSON.parse(readFileSync(resolve('src/renderer/public/data', path), 'utf8')) as T;
    const view = viewForFormat(read<DexFile>('dex.json'), FORMATS[format]);
    const usage = read<SmogonBundle>(`usage/${format}.json`);
    const rows = checkRows(usage, buildSmogonSetPool(usage, view.pokemonById));
    const out = resolve(option(args, 'out', `ml/data/sim/${format}.checks.jsonl`));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`Wrote ${rows.length} check rows to ${out}`);
    return;
  }
  const pairs = Number(option(args, 'pairs', '1000'));
  const games = Number(option(args, 'games', '4'));
  const offMeta = Number(option(args, 'offmeta', '0.25'));
  const workers = Math.max(1, Math.min(pairs, Number(option(args, 'workers', String(Math.max(1, cpus().length - 2))))));
  const seed = Number(option(args, 'seed', '1'));
  const out = resolve(option(args, 'out', `ml/data/sim/${format}.jsonl`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out.replace(/\.jsonl$/, '')}.features.json`, JSON.stringify(FEATURE_NAMES, null, 2));

  const stream = createWriteStream(out);
  const started = Date.now();
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const share = Math.floor(pairs / workers) + (w < pairs % workers ? 1 : 0);
      const job: WorkerJob = { root: process.cwd(), format, pairs: share, games, offMeta, seed: seed * 1_000_003 + w * 7_919_000 };
      return new Promise<void>((ok, fail) => {
        const worker = new Worker(workerFile, { workerData: job });
        worker.on('message', (line: string) => {
          stream.write(`${line}\n`);
          if (++done % 100 === 0) console.log(`${done}/${pairs} pairs (${((Date.now() - started) / 1000).toFixed(0)} s)`);
        });
        worker.on('error', fail);
        worker.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`worker ${w} exited with ${code}`))));
      });
    }),
  );
  await new Promise<void>((ok) => stream.end(ok));
  console.log(`Wrote ${done} pairs to ${out} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
