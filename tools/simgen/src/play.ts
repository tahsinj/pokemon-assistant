/** One-on-one games between two sets, with the Search bot on both sides. */
import { Teams, type PokemonSet } from '@pkmn/sim';
import { Engine, seedFrom } from '../../../src/renderer/src/engine/engine';
import type { Bot } from '../../../src/renderer/src/engine/bots/bot';
import { featureVector, matchupFeatures } from '../../../src/renderer/src/ml/matchupFeatures';
import { specOf, type SampledSet } from './sets';

/** Games longer than this are scored as ties (two walls that can't hurt each other). */
const TURN_LIMIT = 60;

export interface GameResult {
  /** 1 when A won, 0 when B won, 0.5 for a tie. */
  score: number;
  hpA: number;
  hpB: number;
  turns: number;
}

export function playGame(a: PokemonSet, b: PokemonSet, botA: Bot, botB: Bot, seed: number): GameResult {
  const engine = Engine.start({
    format: 'gen9customgame',
    seed: seedFrom(seed),
    p1: { name: 'A', team: Teams.pack([a]) },
    p2: { name: 'B', team: Teams.pack([b]) },
  });
  for (let n = 0; n < 400 && !engine.ended && engine.turn <= TURN_LIMIT; n++) {
    let chose = false;
    for (const side of ['p1', 'p2'] as const) {
      if (!engine.needsChoice(side)) continue;
      const bot = side === 'p1' ? botA : botB;
      const choice = bot.choose(engine, side, engine.request(side)!);
      if (!engine.choose(side, choice)) engine.choose(side, 'default');
      chose = true;
    }
    if (!chose) break;
  }
  const share = (side: 'p1' | 'p2') => {
    const p = engine.battle[side].pokemon[0];
    return p.fainted ? 0 : p.hp / p.maxhp;
  };
  const w = engine.ended ? engine.winner : '';
  return { score: w === 'A' ? 1 : w === 'B' ? 0 : 0.5, hpA: share('p1'), hpB: share('p2'), turns: engine.turn };
}

export interface PairRecord {
  format: string;
  a: string;
  b: string;
  a_species: string;
  b_species: string;
  a_variant: string;
  b_variant: string;
  games: number;
  /** A's mean score: wins count 1, ties 0.5. */
  win: number;
  hp_a: number;
  hp_b: number;
  turns: number;
  features: number[];
}

/** Several games of A against B, sides swapped every other game. */
export function playPair(format: string, a: SampledSet, b: SampledSet, bots: [Bot, Bot], games: number, seed: number): PairRecord {
  let win = 0;
  let hpA = 0;
  let hpB = 0;
  let turns = 0;
  for (let g = 0; g < games; g++) {
    const swap = g % 2 === 1;
    const r = swap ? playGame(b.set, a.set, bots[1], bots[0], seed + g) : playGame(a.set, b.set, bots[0], bots[1], seed + g);
    win += swap ? 1 - r.score : r.score;
    hpA += swap ? r.hpB : r.hpA;
    hpB += swap ? r.hpA : r.hpB;
    turns += r.turns;
  }
  return {
    format,
    a: Teams.pack([a.set]),
    b: Teams.pack([b.set]),
    a_species: a.set.species,
    b_species: b.set.species,
    a_variant: a.variant,
    b_variant: b.variant,
    games,
    win: win / games,
    hp_a: hpA / games,
    hp_b: hpB / games,
    turns: turns / games,
    features: featureVector(matchupFeatures(specOf(a.set), specOf(b.set))),
  };
}
