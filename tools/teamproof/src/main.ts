/**
 * The team model's proof (SPEC 5.6): for one box, the Classic team and the
 * team model's team each play the same meta teams on the same seeds, with
 * the Search bot on both sides, and the win rates are compared.
 *
 * Usage: npm run teamproof -- [--format gen9ou] [--games 500] [--workers 8] [--seed 1]
 *        [--models ml/data/models/<format>] [--out docs/team-proof-<format>.md]
 * Needs a trained team model.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import * as ort from 'onnxruntime-web/wasm';
import { toID } from '@pkmn/sim';
import { seededRandom } from '../../../src/renderer/src/engine/bots/random';
import { packSpecs } from '../../../src/renderer/src/engine/verify';
import { wilson } from '../../../src/renderer/src/engine/wilson';
import { buildSmogonSetPool } from '../../../src/renderer/src/lib/battle/predictor/smogonPriors';
import { buildBestTeams, buildPool, type MemberAdvice } from '../../../src/renderer/src/lib/bestSix';
import type { PcPokemonRecord } from '../../../src/renderer/src/lib/bridgeTypes';
import { viewForFormat, type DexFile } from '../../../src/renderer/src/lib/data';
import { FORMATS, type FormatId } from '../../../src/renderer/src/lib/formats';
import { pcSpec } from '../../../src/renderer/src/lib/matchup';
import type { SmogonBundle } from '../../../src/renderer/src/lib/smogon';
import { searchTeams, usageSpecies } from '../../../src/renderer/src/lib/teamSearch';
import { makeTeamScorer, type MetaTeams, type Vocab } from '../../../src/renderer/src/ml/teamModel';
import { specOf, SetSampler } from '../../simgen/src/sets';
import { likeliest } from '../../simgen/src/checks';
import type { ProofJob } from './worker';

function option(args: string[], name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

export async function run(args: string[], workerFile: string): Promise<void> {
  const format = option(args, 'format', 'gen9ou') as FormatId;
  const games = Number(option(args, 'games', '500'));
  const workers = Number(option(args, 'workers', String(Math.max(1, cpus().length - 2))));
  const seed = Number(option(args, 'seed', '1'));
  const read = <T>(path: string) => JSON.parse(readFileSync(resolve(path), 'utf8')) as T;
  const view = viewForFormat(read<DexFile>('src/renderer/public/data/dex.json'), FORMATS[format]);
  const usage = read<SmogonBundle>(`src/renderer/public/data/usage/${format}.json`);
  const setPool = buildSmogonSetPool(usage, view.pokemonById);

  // A casual box: 30 species from usage, about a third with an off-meta change.
  const sampler = new SetSampler(usage, setPool, view.pokemonById);
  const rand = seededRandom(seed);
  const records: PcPokemonRecord[] = [];
  for (let tries = 0; records.length < 30 && tries < 500; tries++) {
    const { set } = sampler.sample(rand, 0.35);
    const speciesId = toID(set.species);
    if (records.some((r) => r.speciesId === speciesId)) continue;
    records.push({
      id: `box${records.length}`,
      boxId: 'box',
      slot: records.length,
      speciesId,
      speciesDisplay: set.species,
      nickname: null,
      level: 100,
      gender: 'male',
      nature: set.nature,
      ability: set.ability,
      item: set.item || null,
      ivs: specOf(set).ivs,
      evs: specOf(set).evs,
      moves: set.moves,
      notes: null,
      shiny: false,
      updatedAt: 0,
    } as PcPokemonRecord);
  }

  const models = resolve(option(args, 'models', `ml/data/models/${format}`));
  ort.env.wasm.numThreads = 1;
  const session = await ort.InferenceSession.create(readFileSync(`${models}/team.onnx`));
  const scorer = makeTeamScorer(read<Vocab>(`${models}/team-vocab.json`), read<MetaTeams>(`${models}/meta-teams.json`), async (feeds) => {
    const tensors: Record<string, ort.Tensor> = {};
    for (const [k, f] of Object.entries(feeds)) tensors[k] = f.data instanceof BigInt64Array ? new ort.Tensor('int64', f.data, f.dims) : new ort.Tensor('float32', f.data, f.dims);
    return (await session.run(tensors)).win.data as Float32Array;
  });

  const classic = buildBestTeams(records, view.pokemonById, view.moves, usage).candidates[0];
  const found = await searchTeams(buildPool(records, view.pokemonById, view.moves, usage), scorer, view.moves, () => true, usageSpecies(usage, view.pokemonById));
  const model = found?.candidates[0];
  if (!classic || !model) throw new Error('Could not build both teams from the box.');
  const pack = (members: MemberAdvice[]) => packSpecs(members.map((m) => pcSpec({ rec: m.rec, p: m.p }, view.moves)));
  const teams = { classic: pack(classic.members), model: pack(model.members) };
  const metaOf = async (members: MemberAdvice[]) => (await scorer.metaScores([members.map((m) => ({ species: m.p.id, base: m.p.baseSpecies, item: m.rec.item, ability: m.rec.ability, moves: m.rec.moves }))]))![0];

  // Opponents: the meta teams with each species on its likeliest usage set.
  const opponents = scorer.metaTeams
    .map((team) => team.map((m) => likeliest(m.species, setPool, usage)).filter((s) => s !== null))
    .filter((t) => t.length === 6)
    .slice(0, 100)
    .map((t) => packSpecs(t.map(specOf)));

  const jobs: ProofJob['games'] = [];
  for (let i = 0; i < games; i++) {
    for (const which of ['classic', 'model'] as const) jobs.push({ which, opponent: i % opponents.length, seed: seed * 100_000 + i });
  }
  const results: Record<'classic' | 'model', number[]> = { classic: new Array(games), model: new Array(games) };
  let done = 0;
  await Promise.all(
    Array.from({ length: workers }, (_, w) =>
      new Promise<void>((ok, fail) => {
        const worker = new Worker(workerFile, {
          workerData: { format: FORMATS[format].showdownFormat, teams, opponents, games: jobs.filter((_, j) => j % workers === w) } satisfies ProofJob,
        });
        worker.on('message', (m: { which: 'classic' | 'model'; seed: number; score: number }) => {
          results[m.which][m.seed - seed * 100_000] = m.score;
          if (++done % 50 === 0) console.log(`${done}/${jobs.length} games`);
        });
        worker.on('error', fail);
        worker.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`worker ${w} exited with ${code}`))));
      }),
    ),
  );

  const summary = (xs: number[]) => {
    const score = xs.reduce((s, x) => s + x, 0);
    const [low, high] = wilson(score, xs.length);
    return { rate: score / xs.length, low, high };
  };
  const c = summary(results.classic);
  const m = summary(results.model);
  // Same opponent and seed for both teams, so compare game by game.
  const diffs = results.model.map((x, i) => x - results.classic[i]);
  const mean = diffs.reduce((s, x) => s + x, 0) / games;
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, games - 1));
  const half = (1.96 * sd) / Math.sqrt(games);
  const names = (members: MemberAdvice[]) => members.map((x) => x.p.name).join(', ');
  const report = `# Team model against Classic: ${FORMATS[format].label}

Measured by \`npm run teamproof\` on ${new Date().toISOString().slice(0, 10)}. A box of ${records.length} Pokémon drawn from
${FORMATS[format].label} usage (about a third with an off-meta change: an odd spread, a random
move or no item). Classic and the team model each picked a team from it; each
team then played ${games} games against ${opponents.length} high-rated meta teams from
${scorer.month}, the same opponent and seed for both, with the Search bot on both
sides.

| Team | Members | Meta score | Win rate (95% interval) |
| --- | --- | --- | --- |
| Team model | ${names(model.members)} | ${pct(await metaOf(model.members))} | ${pct(m.rate)} (${pct(m.low)} to ${pct(m.high)}) |
| Classic | ${names(classic.members)} | ${pct(await metaOf(classic.members))} | ${pct(c.rate)} (${pct(c.low)} to ${pct(c.high)}) |

Difference, team model minus Classic, game by game: ${mean >= 0 ? '+' : ''}${pct(mean)} (${pct(mean - half)} to ${pct(mean + half)}).
`;
  writeFileSync(resolve(option(args, 'out', `docs/team-proof-${format}.md`)), report);
  console.log(report);
}
