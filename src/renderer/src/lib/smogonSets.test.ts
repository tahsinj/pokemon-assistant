import { describe, expect, it } from 'vitest';
import { bestMatchingSet, resolveSetMoves } from './smogonSets';
import type { Pokemon } from './types';
import type { SmogonSet, SmogonSpeciesIntel } from './smogon';

const learn = (...ids: string[]) => ids.map((m) => ({ learn: 'level', move: m }));

const garchomp = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['roughskin'],
  hiddenAbilities: [],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: [],
  height: 19,
  weight: 950,
  labels: [],
  moves: learn('swordsdance', 'earthquake', 'stoneedge', 'stealthrock', 'scaleshot'),
} as unknown as Pokemon;

const sdSet: SmogonSet = {
  moves: [['Swords Dance'], ['Earthquake'], ['Outrage', 'Stone Edge'], ['Stealth Rock', 'Spikes']],
  item: ['Loaded Dice', 'Rocky Helmet'],
  ability: 'Rough Skin',
  nature: 'Jolly',
  evs: [0, 252, 0, 0, 4, 252],
};

const tankSet: SmogonSet = {
  moves: [['Earthquake'], ['Toxic'], ['Protect'], ['Stealth Rock']],
  item: ['Leftovers'],
  ability: 'Rough Skin',
  nature: 'Careful',
  evs: [252, 0, 0, 0, 200, 56],
};

const intel = {
  name: 'Garchomp',
  usage: 0.11,
  rank: 12,
  abilities: [],
  items: [],
  spreads: [],
  moves: [],
  teraTypes: [],
  teammates: [],
  checks: [],
  sets: { 'Swords Dance': sdSet, TankChomp: tankSet },
} as unknown as SmogonSpeciesIntel;

describe('resolveSetMoves', () => {
  it('skips unlearnable slash options and drops empty slots', () => {
    const moves = resolveSetMoves(garchomp, sdSet);
    expect(moves).toContain('Stone Edge'); // Outrage unlearnable here
    expect(moves).not.toContain('Outrage');
    expect(moves).toEqual(['Swords Dance', 'Earthquake', 'Stone Edge', 'Stealth Rock']);
  });

  it('dedupes across slots', () => {
    const dup: SmogonSet = { ...sdSet, moves: [['Earthquake'], ['Earthquake'], ['Stone Edge'], ['Spikes']] };
    expect(resolveSetMoves(garchomp, dup)).toEqual(['Earthquake', 'Stone Edge']);
  });
});

describe('bestMatchingSet', () => {
  it('prefers higher move overlap', () => {
    const m = bestMatchingSet(
      { moves: ['Swords Dance', 'Earthquake', 'Scale Shot'], nature: 'Hardy', item: null },
      garchomp,
      intel,
    );
    expect(m?.name).toBe('Swords Dance');
  });

  it('breaks ties with nature and item', () => {
    // One overlapping move each (Earthquake); Careful nature + Leftovers tips it.
    const m = bestMatchingSet(
      { moves: ['Earthquake'], nature: 'Careful', item: 'Leftovers' },
      garchomp,
      intel,
    );
    expect(m?.name).toBe('TankChomp');
  });

  it('returns null when no sets exist', () => {
    const bare = { ...intel, sets: undefined } as SmogonSpeciesIntel;
    expect(bestMatchingSet({ moves: [], nature: 'Hardy', item: null }, garchomp, bare)).toBeNull();
  });
});
