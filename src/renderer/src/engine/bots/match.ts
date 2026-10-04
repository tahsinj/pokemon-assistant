/** Bot-vs-bot games for tests, the gauntlet and simulation data. */
import { Engine, playOut, randomTeam, seedFrom } from '../engine';
import type { SideId } from '../types';
import type { Bot } from './bot';

export interface MatchResult {
  /** Which bot won: 'a', 'b', or 'tie' (including games cut off at the decision cap). */
  winner: 'a' | 'b' | 'tie';
  turns: number;
}

/**
 * One game between two bots. Teams come from `teams` or are random battle
 * teams from `seed`; bot A plays p1 on even seeds and p2 on odd ones, so team
 * and side advantages cancel out over a series.
 */
export function playMatch(a: Bot, b: Bot, seed: number, opts: { format?: string; teams?: [string, string] } = {}): MatchResult {
  const [t1, t2] = opts.teams ?? [
    randomTeam('gen9randombattle', seedFrom(seed * 2 + 1)),
    randomTeam('gen9randombattle', seedFrom(seed * 2 + 2)),
  ];
  const aSide: SideId = seed % 2 === 0 ? 'p1' : 'p2';
  const engine = Engine.start({
    format: opts.format ?? 'gen9ou',
    seed: seedFrom(seed),
    p1: { name: aSide === 'p1' ? 'A' : 'B', team: t1 },
    p2: { name: aSide === 'p1' ? 'B' : 'A', team: t2 },
  });
  playOut(engine, (side, req) => (side === aSide ? a : b).choose(engine, side, req));
  const w = engine.winner;
  return { winner: w === 'A' ? 'a' : w === 'B' ? 'b' : 'tie', turns: engine.turn };
}

/** Bot A's score over a series: wins count 1, ties 0.5. */
export function series(a: Bot, b: Bot, games: number, firstSeed = 1): { score: number; games: number } {
  let score = 0;
  for (let i = 0; i < games; i++) {
    const r = playMatch(a, b, firstSeed + i);
    score += r.winner === 'a' ? 1 : r.winner === 'tie' ? 0.5 : 0;
  }
  return { score, games };
}
