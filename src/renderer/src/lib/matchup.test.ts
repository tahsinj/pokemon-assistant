import { describe, it, expect } from 'vitest';
import { evaluateMatchup, opponentAbility, classifyRace } from './matchup';
import { assumedOpponentSpec } from './opponentSet';
import type { Pokemon, Move } from './types';
import type { PcPokemonRecord } from './bridgeTypes';

const weavile = {
  id: 'weavile', name: 'Weavile', dex: 461, types: ['Dark', 'Ice'],
  baseStats: { hp: 70, atk: 120, def: 65, spa: 45, spd: 85, spe: 125 },
  abilities: ['Pressure'],
  moves: [{ move: 'iciclecrash', learn: 'level' }, { move: 'iceshard', learn: 'level' }, { move: 'knockoff', learn: 'level' }],
} as unknown as Pokemon;

const garchomp = {
  id: 'garchomp', name: 'Garchomp', dex: 445, types: ['Dragon', 'Ground'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  abilities: ['Rough Skin'],
  moves: [{ move: 'earthquake', learn: 'level' }, { move: 'dragonclaw', learn: 'level' }],
} as unknown as Pokemon;

const moves = {
  iciclecrash: { id: 'iciclecrash', name: 'Icicle Crash', type: 'Ice', power: 85 },
  iceshard: { id: 'iceshard', name: 'Ice Shard', type: 'Ice', power: 40 },
  knockoff: { id: 'knockoff', name: 'Knock Off', type: 'Dark', power: 65 },
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'Ground', power: 100 },
  dragonclaw: { id: 'dragonclaw', name: 'Dragon Claw', type: 'Dragon', power: 80 },
} as unknown as Record<string, Move>;

function rec(speciesId: string, name: string, level: number, mv: string[]): PcPokemonRecord {
  return {
    id: `pc-${speciesId}`, speciesId, speciesDisplay: name, nickname: '',
    level, nature: 'Jolly', ability: null, item: null, ivs: null, evs: null, moves: mv, boxId: 'b1',
  } as unknown as PcPokemonRecord;
}

// Weavile with only Knock Off in its learnset, so the fallback move
// selector cannot supplement the spec with Ice-type moves (which would
// produce a super-effective hit vs Garchomp and corrupt the "no answer" fixture).
const weavileKOonly = {
  ...weavile,
  moves: [{ move: 'knockoff', learn: 'level' }],
} as unknown as Pokemon;

describe('evaluateMatchup', () => {
  it('rates a fast super-effective attacker as a WIN that outspeeds and OHKOs', () => {
    const opp = { p: garchomp, level: 100, set: assumedOpponentSpec(garchomp, 100, null, moves) };
    const cell = evaluateMatchup(
      { rec: rec('weavile', 'Weavile', 100, ['Icicle Crash', 'Ice Shard', 'Knock Off']), p: weavile },
      opp, moves,
    );
    expect(cell.iAmFaster).toBe(true);
    expect(cell.verdict).toBe('win');
    expect(['OHKO', '2HKO']).toContain(cell.label);
    expect(cell.moveName).toBeTruthy();
    expect(['Icicle Crash', 'Ice Shard', 'Knock Off']).toContain(cell.moveName);
  });

  it('rates a frail mon with no super-effective answer as not a win', () => {
    // Uses weavileKOonly so the fallback move selector cannot add Ice-type moves
    // that would inadvertently give a super-effective answer vs Garchomp.
    const opp = { p: garchomp, level: 100, set: assumedOpponentSpec(garchomp, 100, null, moves) };
    const cell = evaluateMatchup(
      { rec: rec('weavile', 'Weavile', 100, ['Knock Off']), p: weavileKOonly },
      opp, moves,
    );
    expect(cell.verdict === 'lose' || cell.verdict === 'trade').toBe(true);
  });

  it('a bulkier (Competitive) opponent never has a higher KO chance than Max IV', () => {
    const oppMax = { p: garchomp, level: 100, set: assumedOpponentSpec(garchomp, 100, null, moves, 'maxIv') };
    const oppComp = { p: garchomp, level: 100, set: assumedOpponentSpec(garchomp, 100, null, moves, 'competitive') };
    const pc = { rec: rec('weavile', 'Weavile', 100, ['Icicle Crash', 'Ice Shard', 'Knock Off']), p: weavile };
    const a = evaluateMatchup(pc, oppMax, moves);
    const b = evaluateMatchup(pc, oppComp, moves);
    expect(a.myKoChance).toBeGreaterThanOrEqual(b.myKoChance);
  });

  it('opponent Dynamax doubles HP, taking an extra hit to KO', () => {
    const set = assumedOpponentSpec(garchomp, 100, null, moves);
    const pc = { rec: rec('weavile', 'Weavile', 100, ['Icicle Crash', 'Ice Shard', 'Knock Off']), p: weavile };
    const base = evaluateMatchup(pc, { p: garchomp, level: 100, set }, moves);
    const dmax = evaluateMatchup(pc, { p: garchomp, level: 100, set, dynamax: true }, moves);
    // 4x Icicle Crash OHKOs a 357-HP Garchomp but not a 714-HP Dynamaxed one.
    expect(base.label).toBe('OHKO');
    expect(dmax.label).not.toBe('OHKO');
  });

  it('opponent Tera replaces defensive typing (Garchomp Tera Fairy resists Ice)', () => {
    const set = assumedOpponentSpec(garchomp, 100, null, moves);
    const pc = { rec: rec('weavile', 'Weavile', 100, ['Icicle Crash', 'Ice Shard', 'Knock Off']), p: weavile };
    const base = evaluateMatchup(pc, { p: garchomp, level: 100, set }, moves);
    const tera = evaluateMatchup(pc, { p: garchomp, level: 100, set, teraType: 'Fairy' }, moves);
    // Ice is 4x vs Dragon/Ground but only 1x vs a pure-Fairy Tera form.
    expect(tera.myKoChance).toBeLessThan(base.myKoChance);
  });

  it('respects an opponent immunity ability (Levitate negates Ground)', () => {
    const levitator = {
      id: 'levitator', name: 'Levitator', dex: 1, types: ['Poison'],
      baseStats: { hp: 70, atk: 70, def: 70, spa: 70, spd: 70, spe: 70 },
      abilities: ['levitate'], moves: [{ move: 'earthquake', learn: 'level' }],
    } as unknown as Pokemon;
    const set = assumedOpponentSpec(levitator, 100, null, moves);
    const groundOnly = { rec: rec('mudbray', 'Mudbray', 100, ['Earthquake']), p: {
      id: 'mudbray', name: 'Mudbray', dex: 2, types: ['Ground'],
      baseStats: { hp: 90, atk: 125, def: 100, spa: 55, spd: 85, spe: 35 },
      abilities: ['Stamina'], moves: [{ move: 'earthquake', learn: 'level' }],
    } as unknown as Pokemon };
    const cell = evaluateMatchup(groundOnly, { p: levitator, level: 100, set }, moves);
    expect(cell.moveName).toBeNull();   // Earthquake is the only move and it's immune
    expect(cell.verdict).toBe('lose');
  });

  it('respects Sturdy in the opponent ability pool (denies the OHKO)', () => {
    // Rock mon whose ability pool includes Sturdy though it isn't its first ability.
    const sturdyRock = {
      id: 'sturdyrock', name: 'Sturdy Rock', dex: 3, types: ['Rock'],
      abilities: ['rockhead', 'sturdy'],
      baseStats: { hp: 60, atk: 80, def: 60, spa: 40, spd: 60, spe: 50 },
      moves: [{ move: 'earthquake', learn: 'level' }],
    } as unknown as Pokemon;
    const set = assumedOpponentSpec(sturdyRock, 100, null, moves);
    const pc = { rec: rec('garchomp', 'Garchomp', 100, ['Earthquake']), p: garchomp };
    const cell = evaluateMatchup(pc, { p: sturdyRock, level: 100, set }, moves);
    expect(cell.label).not.toBe('OHKO'); // Ground is 2x but Sturdy survives from full
  });

});

describe('classifyRace (speed-race verdict)', () => {
  const r = (over: Partial<Parameters<typeof classifyRace>[0]>) =>
    classifyRace({ myKoN: 2, theirKoN: Infinity, iAmFaster: true, myPctMax: 60, theirPctMax: 30, ...over });

  it('faster OHKO is a clean win', () => {
    expect(r({ myKoN: 1, theirKoN: 1 }).verdict).toBe('win');
  });

  it('faster 2HKO is a win when it survives the return hit', () => {
    expect(r({ myKoN: 2, theirKoN: 2 }).verdict).toBe('win'); // they need 2 hits, I KO on my 2nd first
    expect(r({ myKoN: 2, theirKoN: 3 }).verdict).toBe('win');
  });

  it('faster 2HKO is NOT a win when the opponent OHKOs back', () => {
    const v = r({ myKoN: 2, theirKoN: 1, myPctMax: 60 });
    expect(v.verdict).not.toBe('win'); // I hit once, get OHKO'd before my 2nd
    expect(v.verdict).toBe('trade');   // ...but I chunked them >=50% -> trade
  });

  it('slower must KO strictly sooner; a tie is a trade, not a win', () => {
    expect(r({ iAmFaster: false, myKoN: 2, theirKoN: 3 }).verdict).toBe('win');
    expect(r({ iAmFaster: false, myKoN: 2, theirKoN: 2 }).verdict).toBe('trade');
    expect(r({ iAmFaster: false, myKoN: 3, theirKoN: 2, myPctMax: 35 }).verdict).toBe('lose');
  });

  it('can KO + opponent can not = wall win; neither can KO + I chip = stall trade', () => {
    expect(r({ myKoN: 3, theirKoN: Infinity }).verdict).toBe('win'); // grind wall
    expect(r({ myKoN: Infinity, theirKoN: Infinity, myPctMax: 30 }).verdict).toBe('trade');
    expect(r({ myKoN: Infinity, theirKoN: 2, myPctMax: 30 }).verdict).toBe('lose');
  });
});

describe('opponentAbility (tier-aware assumption)', () => {
  const magnezone = {
    abilities: ['magnetpull', 'sturdy'], hiddenAbilities: ['analytic'],
  } as unknown as Pokemon;
  const levitator = { abilities: ['levitate'], hiddenAbilities: [] } as unknown as Pokemon;

  it('Competitive uses the realistic most-used ability (no speculative Sturdy)', () => {
    expect(opponentAbility(magnezone, 'Magnet Pull', 'competitive')).toBe('Magnet Pull');
  });

  it('Min / Max IV assume the worst-case defensive ability (Sturdy)', () => {
    expect(opponentAbility(magnezone, 'Magnet Pull', 'maxIv')).toBe('sturdy');
    expect(opponentAbility(magnezone, 'Magnet Pull', 'min')).toBe('sturdy');
  });

  it('keeps a real immunity ability on every tier (Levitate)', () => {
    expect(opponentAbility(levitator, 'Levitate', 'competitive')).toBe('Levitate');
    expect(opponentAbility(levitator, 'Levitate', 'maxIv')).toBe('levitate');
  });
});
