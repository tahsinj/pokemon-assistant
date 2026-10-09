/**
 * Checks a drafted team by playing it: whole-team games against the
 * opponent team with the Search bot on both sides, sides swapping each game.
 */
import { Teams, type PokemonSet } from '@pkmn/sim';
import type { BattlePokemonSpec } from '../lib/battle/types';
import type { RaidRules } from '../lib/raid';
import { searchBot } from './bots/search';
import { Engine, playOut, seedFrom } from './engine';

/** A calc input as a simulator set. */
export function specToSet(spec: BattlePokemonSpec): PokemonSet {
  return {
    name: spec.speciesName,
    species: spec.speciesName,
    item: spec.item ?? '',
    ability: spec.ability ?? '',
    moves: spec.moves.map((m) => m.name),
    nature: spec.nature,
    gender: '',
    evs: { ...spec.evs },
    ivs: { ...spec.ivs },
    level: spec.level,
    teraType: spec.teraType,
  };
}

export const packSpecs = (specs: BattlePokemonSpec[]) => Teams.pack(specs.map(specToSet));

/** One game: 1 when team A wins, 0 when it loses, 0.5 for a tie. A plays p1 on even seeds. */
export function playTeams(format: string, teamA: string, teamB: string, seed: number): number {
  const aFirst = seed % 2 === 0;
  const engine = Engine.start({
    format,
    seed: seedFrom(seed),
    p1: { name: aFirst ? 'A' : 'B', team: aFirst ? teamA : teamB },
    p2: { name: aFirst ? 'B' : 'A', team: aFirst ? teamB : teamA },
  });
  // One world per decision keeps a game to a few seconds; it is still the level 2 bot.
  const bots = { p1: searchBot({ worlds: 1 }), p2: searchBot({ worlds: 1 }) };
  playOut(engine, (side, req) => bots[side].choose(engine, side, req), 1500);
  return engine.winner === 'A' ? 1 : engine.winner === 'B' ? 0 : 0.5;
}

/**
 * One raid: `member` alone against the boss with the raid's HP multiplier and
 * boosts, Search bots on both sides. 1 for a win inside the turn limit.
 * Extra boss actions per turn are left to the quick estimate.
 */
export function playRaid(member: string, boss: string, rules: RaidRules, seed: number): { score: number; turns: number } {
  const engine = Engine.start({ format: 'gen9customgame', seed: seedFrom(seed), p1: { name: 'You', team: member }, p2: { name: 'Boss', team: boss } });
  const b = engine.battle.p2.pokemon[0] as unknown as { maxhp: number; baseMaxhp: number; hp: number; boosts: Record<string, number> };
  b.maxhp = Math.round(b.maxhp * rules.hpMultiplier);
  b.baseMaxhp = b.maxhp;
  b.hp = b.maxhp;
  Object.assign(b.boosts, rules.statBoosts);
  const bots = { p1: searchBot({ worlds: 1 }), p2: searchBot({ worlds: 1 }) };
  for (let n = 0; n < 400 && !engine.ended && engine.turn <= rules.turnLimit; n++) {
    let chose = false;
    for (const side of ['p1', 'p2'] as const) {
      if (!engine.needsChoice(side)) continue;
      if (!engine.choose(side, bots[side].choose(engine, side, engine.request(side)!))) engine.choose(side, 'default');
      chose = true;
    }
    if (!chose) break;
  }
  return { score: engine.ended && engine.winner === 'You' ? 1 : 0, turns: engine.turn };
}
