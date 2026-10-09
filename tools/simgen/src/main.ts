/**
 * Generates labelled one-on-one battles for the matchup model.
 *
 * Usage: npm run simgen -- [--format gen9ou] [--pairs 1000] [--games 4]
 *        [--offmeta 0.25] [--workers 8] [--seed 1] [--out ml/data/sim/<format>.jsonl]
 */
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { FEATURE_NAMES } from '../../../src/renderer/src/ml/matchupFeatures';
import { FORMAT_ORDER, type FormatId } from '../../../src/renderer/src/lib/formats';
import type { WorkerJob } from './worker';

function option(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

export async function run(args: string[], workerFile: string): Promise<void> {
  const format = option(args, 'format', 'gen9ou') as FormatId;
  if (!FORMAT_ORDER.includes(format)) throw new Error(`Unknown format ${format}; use one of ${FORMAT_ORDER.join(', ')}.`);
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
