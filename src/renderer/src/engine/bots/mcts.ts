/**
 * Level 3: Monte Carlo search with determinization. The foe's hidden sets are
 * drawn from the set predictor (as for the
 * Search bot). Each iteration picks one of our actions by UCB, plays it
 * against one of the foe's likely replies in one copy, plays a couple more
 * turns with the Greedy bot on both sides, and scores where that lands. The
 * most tried action wins.
 */
import { seedFrom, type Engine } from '../engine';
import type { BattleRequest, SideId } from '../types';
import type { CandidateSet } from '../../lib/battle/predictor/types';
import { foeOf, type Bot } from './bot';
import { determinize } from './determinize';
import { greedyBot } from './greedy';
import { seededRandom } from './random';
import { candidates, evaluate, foeReplies, lookahead, viewKeeper } from './search';
import { engineContext } from './setPool';

export interface MctsOptions {
  /** Simulations per decision; a fixed count keeps games reproducible. */
  iterations: number;
  /** Stop early past this many milliseconds. */
  timeMs: number;
  /** Copies of the battle with sampled foe sets. */
  worlds: number;
  /** Turns played after the first, with Greedy on both sides. */
  rolloutTurns: number;
  /** UCB exploration weight, in units of position value. */
  exploration: number;
}

const DEFAULTS: MctsOptions = { iterations: 120, timeMs: 3000, worlds: 4, rolloutTurns: 2, exploration: 1.5 };

let counter = 0;

/** Play `turns` more turns with Greedy on both sides. */
function rollout(engine: Engine, turns: number): void {
  const stop = engine.turn + turns;
  for (let guard = 0; guard < 40 && !engine.ended && engine.turn < stop; guard++) {
    let chose = false;
    for (const s of ['p1', 'p2'] as const) {
      if (!engine.needsChoice(s)) continue;
      if (!engine.choose(s, greedyBot.choose(engine, s, engine.request(s)!))) engine.choose(s, 'default');
      chose = true;
    }
    if (!chose) break;
  }
}

/** Our actions with their visit counts and mean values, most visited first. */
export function mctsRank(engine: Engine, side: SideId, req: BattleRequest, view: Parameters<typeof determinize>[1], options: Partial<MctsOptions> = {}) {
  const o = { ...DEFAULTS, ...options };
  const foe = foeOf(side);
  const actions = candidates(engine, side, req);
  const worlds = Array.from({ length: o.worlds }, () => {
    const w = engine.clone();
    determinize(w, view, foe, seededRandom(++counter));
    const replies = foeReplies(w, side, 3);
    return { engine: w, replies, foeStats: replies.map(() => ({ n: 0, sum: 0 })) };
  });
  const ucbPick = <T extends { n: number; sum: number }>(arms: T[], total: number): T =>
    arms.find((a) => a.n === 0) ??
    arms.reduce((a, b) => {
      const ucb = (x: T) => x.sum / x.n + o.exploration * Math.sqrt(Math.log(Math.max(1, total)) / x.n);
      return ucb(b) > ucb(a) ? b : a;
    });
  const stats = actions.map((choice) => ({ choice, n: 0, sum: 0, illegal: false }));
  const started = Date.now();
  for (let it = 0; it < o.iterations && Date.now() - started < o.timeMs; it++) {
    const live = stats.filter((s) => !s.illegal);
    if (!live.length) break;
    const pick = ucbPick(live, live.reduce((t, s) => t + s.n, 0));
    const world = worlds[it % worlds.length];
    const foeArm = ucbPick(world.foeStats, world.foeStats.reduce((t, s) => t + s.n, 0));
    const c = world.engine.clone();
    c.battle.resetRNG(seedFrom(++counter));
    c.battle[foe].clearChoice();
    c.battle[side].clearChoice();
    if (!c.choose(side, pick.choice)) {
      pick.illegal = true;
      continue;
    }
    if (c.needsChoice(foe)) {
      const reply = world.replies[world.foeStats.indexOf(foeArm)];
      if (!c.choose(foe, reply)) c.choose(foe, 'default');
    }
    rollout(c, o.rolloutTurns);
    const value = 0.5 * evaluate(c.battle, side) + 0.5 * lookahead(c.battle, side);
    pick.n++;
    pick.sum += value;
    foeArm.n++;
    foeArm.sum -= value;
  }
  return stats
    .filter((s) => !s.illegal && s.n > 0)
    .map((s) => ({ choice: s.choice, visits: s.n, score: s.sum / s.n }))
    .sort((a, b) => b.visits - a.visits || b.score - a.score);
}

export function mctsBot(options: Partial<MctsOptions> = {}, setPool?: Record<string, CandidateSet[]>): Bot {
  const viewOf = viewKeeper(engineContext(setPool));
  return {
    level: 3,
    name: 'MCTS',
    choose(engine, side, req) {
      if (req.teamPreview || req.forceSwitch?.[0] || !req.active || req.wait) return greedyBot.choose(engine, side, req);
      const ranked = mctsRank(engine, side, req, viewOf(engine, side), options);
      return ranked[0]?.choice ?? greedyBot.choose(engine, side, req);
    },
  };
}
