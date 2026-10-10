/** Bot strength measured by play: each level against the ones below it. Run through scripts/bots-gauntlet.mjs. */
import type { Bot } from './bot';
import { greedyBot } from './greedy';
import { series } from './match';
import { randomBot } from './random';
import { searchBot } from './search';
import { mctsBot } from './mcts';
import { wilson } from '../wilson';

export { wilson };

export interface PairResult {
  a: string;
  b: string;
  score: number;
  games: number;
  /** 95% Wilson interval for A's score rate. */
  low: number;
  high: number;
}

const eloDiff = (rate: number) => -400 * Math.log10(1 / Math.min(0.99, Math.max(0.01, rate)) - 1);

/** Each level against the one below it, plus the top two against Random. */
const PAIRS: [number, number][] = [
  [1, 0],
  [2, 1],
  [2, 0],
  [3, 2],
  [3, 1],
];

/** `only` limits the run to pairings named like "MCTS-Search". */
export function runGauntlet(games: number, log: (line: string) => void = () => {}, only?: string): PairResult[] {
  const bots: Bot[] = [randomBot(1), greedyBot, searchBot(), mctsBot()];
  const pairs = PAIRS.filter(([i, j]) => !only || only.split(',').includes(`${bots[i].name}-${bots[j].name}`));
  return pairs.map(([i, j]) => {
    const k = PAIRS.findIndex(([a, b]) => a === i && b === j);
    const t0 = Date.now();
    const { score } = series(bots[i], bots[j], games, 10_000 * (k + 1));
    const [low, high] = wilson(score, games);
    const r = { a: bots[i].name, b: bots[j].name, score, games, low, high };
    log(`${r.a} vs ${r.b}: ${score}/${games} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    return r;
  });
}

/** Elo with Random fixed at 1000, chained through the adjacent pairings. */
export function eloTable(results: PairResult[]): { name: string; elo: number }[] {
  const rate = (a: string, b: string) => {
    const r = results.find((x) => x.a === a && x.b === b)!;
    return r.score / r.games;
  };
  const greedy = 1000 + eloDiff(rate('Greedy', 'Random'));
  const search = (greedy + eloDiff(rate('Search', 'Greedy')) + 1000 + eloDiff(rate('Search', 'Random'))) / 2;
  const table = [
    { name: 'Random (level 0)', elo: 1000 },
    { name: 'Greedy (level 1)', elo: Math.round(greedy) },
    { name: 'Search (level 2)', elo: Math.round(search) },
  ];
  if (results.some((r) => r.a === 'MCTS')) {
    const mcts = (search + eloDiff(rate('MCTS', 'Search')) + greedy + eloDiff(rate('MCTS', 'Greedy'))) / 2;
    table.push({ name: 'MCTS (level 3)', elo: Math.round(mcts) });
  }
  return table;
}

export function markdown(results: PairResult[], date: string): string {
  const pct = (x: number) => `${Math.round(100 * x)}%`;
  return [
    '# Bot strength',
    '',
    `Measured by \`npm run bots:gauntlet\` on ${date}: random battle teams under Gen 9 OU`,
    'rules, sides swapped every game. Elo has Random fixed at 1000.',
    '',
    '| Bot | Elo |',
    '| --- | --- |',
    ...eloTable(results).map((e) => `| ${e.name} | ${e.elo} |`),
    '',
    '| Pairing | Score | Win rate (95% interval) |',
    '| --- | --- | --- |',
    ...results.map((r) => `| ${r.a} vs ${r.b} | ${r.score}/${r.games} | ${pct(r.score / r.games)} (${pct(r.low)} to ${pct(r.high)}) |`),
    '',
  ].join('\n');
}
