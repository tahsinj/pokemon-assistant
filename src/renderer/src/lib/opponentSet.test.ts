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

describe('assumedOpponentSpec', () => {
  it('builds the modal set from Smogon intel at the requested level', () => {
    const set = assumedOpponentSpec(garchomp, 100, intel, moves);
    expect(set.input.level).toBe(100);
    expect(set.ability).toBe('Rough Skin');
    expect(set.item).toBe('Loaded Dice');
    expect(set.nature).toBe('Jolly');
    expect(set.input.evs).toEqual({ hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 });
    expect(set.moves).toEqual(['Earthquake', 'Dragon Claw', 'Stealth Rock', 'Fire Fang']);
    expect(set.input.moves).toEqual(set.moves);
  });

  it('falls back to damaging learnset moves and a neutral set when intel is absent', () => {
    const set = assumedOpponentSpec(garchomp, 75, null, moves);
    expect(set.input.level).toBe(75);
    expect(set.nature).toBe('Hardy');
    expect(set.moves).toEqual(['Earthquake', 'Dragon Claw', 'Fire Fang']);
    expect(set.item).toBeNull();
  });
});
