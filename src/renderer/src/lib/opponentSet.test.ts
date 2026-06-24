import { describe, it, expect } from 'vitest';
import { assumedOpponentSpec } from './opponentSet';
import type { Pokemon, Move } from './types';
import type { SmogonSpeciesIntel } from './smogon';

const garchomp = {
  id: 'garchomp', name: 'Garchomp', dex: 445, types: ['Dragon', 'Ground'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  abilities: ['Rough Skin'],
  moves: [
    { move: 'earthquake', learn: 'level' }, { move: 'dragonclaw', learn: 'level' },
    { move: 'stealthrock', learn: 'tm' }, { move: 'firefang', learn: 'level' },
  ],
} as unknown as Pokemon;

const moves = {
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'Ground', power: 100 },
  dragonclaw: { id: 'dragonclaw', name: 'Dragon Claw', type: 'Dragon', power: 80 },
  stealthrock: { id: 'stealthrock', name: 'Stealth Rock', type: 'Rock', power: 0 },
  firefang: { id: 'firefang', name: 'Fire Fang', type: 'Fire', power: 65 },
} as unknown as Record<string, Move>;

const intel = {
  abilities: [{ name: 'Rough Skin', pct: 100 }],
  items: [{ name: 'Loaded Dice', pct: 60 }, { name: 'No item', pct: 40 }],
  moves: [
    { name: 'Earthquake', pct: 95 }, { name: 'Dragon Claw', pct: 70 },
    { name: 'Stealth Rock', pct: 55 }, { name: 'Fire Fang', pct: 40 },
  ],
  spreads: [{ nature: 'Jolly', evs: [0, 252, 0, 0, 4, 252], pct: 50 }],
} as unknown as SmogonSpeciesIntel;

describe('assumedOpponentSpec - moves/ability/item (tier-independent)', () => {
  it('builds the modal moves/ability/item from intel regardless of tier', () => {
    const set = assumedOpponentSpec(garchomp, 100, intel, moves, 'min');
    expect(set.ability).toBe('Rough Skin');
    expect(set.item).toBe('Loaded Dice');
    expect(set.moves).toEqual(['Earthquake', 'Dragon Claw', 'Stealth Rock', 'Fire Fang']);
    expect(set.input.moves).toEqual(set.moves);
    expect(set.input.level).toBe(100);
  });

  it('falls back to damaging learnset moves when intel is absent', () => {
    const set = assumedOpponentSpec(garchomp, 75, null, moves, 'maxIv');
    expect(set.moves).toEqual(['Earthquake', 'Dragon Claw', 'Fire Fang']);
    expect(set.item).toBeNull();
  });
});

describe('assumedOpponentSpec - bulk tiers', () => {
  it('min: 0 IVs, 0 EVs, neutral nature', () => {
    const set = assumedOpponentSpec(garchomp, 100, intel, moves, 'min');
    expect(set.input.ivs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(set.input.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(set.nature).toBe('Hardy');
  });

  it('maxIv: null IVs (=31 downstream), 0 EVs, neutral nature', () => {
    const set = assumedOpponentSpec(garchomp, 100, intel, moves, 'maxIv');
    expect(set.input.ivs).toBeNull();
    expect(set.input.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(set.nature).toBe('Hardy');
  });

  it('competitive: uses the intel modal spread when present', () => {
    const set = assumedOpponentSpec(garchomp, 100, intel, moves, 'competitive');
    expect(set.input.ivs).toBeNull();
    expect(set.input.evs).toEqual({ hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 });
    expect(set.nature).toBe('Jolly');
  });

  it('competitive: standard bulk fallback when intel is absent', () => {
    const set = assumedOpponentSpec(garchomp, 100, null, moves, 'competitive');
    expect(set.input.ivs).toBeNull();
    expect(set.input.evs).toEqual({ hp: 252, atk: 0, def: 128, spa: 0, spd: 128, spe: 0 });
    expect(set.nature).toBe('Hardy');
  });

  it('defaults to maxIv when bulk is omitted', () => {
    const set = assumedOpponentSpec(garchomp, 100, intel, moves);
    expect(set.input.ivs).toBeNull();
    expect(set.input.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});
