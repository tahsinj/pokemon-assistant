import { describe, expect, it } from 'vitest';
import type { Pokemon } from './types';
import type { SmogonSpeciesIntel } from './smogon';
import { curatedFills, sortMovesByUsage, topUsageMoves, usageFill } from './usageSets';

const species: Pokemon = {
  id: 'gholdengo',
  name: 'Gholdengo',
  dex: 1000,
  types: ['Steel', 'Ghost'],
  abilities: ['Good as Gold'],
  hiddenAbilities: [],
  baseStats: { hp: 87, atk: 60, def: 95, spa: 133, spd: 91, spe: 84 },
  eggGroups: [],
  height: 12,
  weight: 30,
  labels: [],
  moves: [
    { learn: 'level', move: 'makeitrain' },
    { learn: 'level', move: 'shadowball' },
    { learn: 'tm', move: 'nastyplot' },
    { learn: 'tm', move: 'recover' },
    { learn: 'tm', move: 'thunderbolt' },
  ],
};

const intel: SmogonSpeciesIntel = {
  name: 'Gholdengo',
  usage: 0.25,
  rank: 3,
  abilities: [{ name: 'Good as Gold', pct: 100 }],
  items: [
    { name: 'Other', pct: 40 },
    { name: 'Air Balloon', pct: 30 },
  ],
  spreads: [{ nature: 'Timid', evs: [4, 0, 0, 252, 0, 252], pct: 18 }],
  moves: [
    { name: 'Make It Rain', pct: 95 },
    { name: 'Shadow Ball', pct: 80 },
    { name: 'Nasty Plot', pct: 70 },
    { name: 'Focus Blast', pct: 45 }, // not learnable in the fixture learnset
    { name: 'Recover', pct: 40 },
    { name: 'Other', pct: 20 },
  ],
  teraTypes: [{ name: 'Steel', pct: 60 }],
  teammates: [],
  checks: [],
  sets: {
    'Nasty Plot': {
      moves: [['Nasty Plot'], ['Make It Rain'], ['Shadow Ball'], ['Focus Blast', 'Recover']],
      item: ['Air Balloon'],
      ability: 'Good as Gold',
      nature: 'Timid',
      evs: [0, 0, 0, 252, 4, 252],
      teraType: 'Steel',
    },
  },
};

describe('topUsageMoves', () => {
  it('returns most-used learnable moves, skipping placeholders and unlearnable moves', () => {
    expect(topUsageMoves(species, intel, 4)).toEqual([
      'Make It Rain',
      'Shadow Ball',
      'Nasty Plot',
      'Recover',
    ]);
  });
});

describe('usageFill', () => {
  it('builds the most common meta set, ignoring "Other" placeholder rows', () => {
    const fill = usageFill(species, intel);
    expect(fill.label).toBe('Showdown Usage');
    expect(fill.ability).toBe('Good as Gold');
    expect(fill.item).toBe('Air Balloon');
    expect(fill.nature).toBe('Timid');
    expect(fill.evs).toEqual({ hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 });
    expect(fill.ivs).toEqual({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
    expect(fill.teraType).toBe('Steel');
    expect(fill.moves).toHaveLength(4);
  });
});

describe('curatedFills', () => {
  it('resolves slash options against the Cobblemon learnset', () => {
    const fills = curatedFills(species, intel);
    expect(fills).toHaveLength(1);
    const f = fills[0];
    expect(f.label).toBe('Nasty Plot');
    // Focus Blast is unlearnable -> the slash slot resolves to Recover.
    expect(f.moves).toEqual(['Nasty Plot', 'Make It Rain', 'Shadow Ball', 'Recover']);
    expect(f.evs.spa).toBe(252);
  });
});

describe('sortMovesByUsage', () => {
  it('puts ladder moves first by usage, then the rest alphabetically', () => {
    const sorted = sortMovesByUsage(['Thunderbolt', 'Recover', 'Make It Rain'], intel);
    expect(sorted).toEqual(['Make It Rain', 'Recover', 'Thunderbolt']);
  });

  it('sorts alphabetically without intel', () => {
    expect(sortMovesByUsage(['b', 'a'], null)).toEqual(['a', 'b']);
  });
});
