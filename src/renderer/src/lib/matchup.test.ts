import { describe, it, expect } from 'vitest';
import { evaluateMatchup } from './matchup';
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

// Weavile with only Knock Off in its learnset - ensures the fallback move
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
});
