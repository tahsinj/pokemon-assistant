import { describe, expect, it } from 'vitest';
import { reviewStoredMon, assessReadiness, formatEvs, type StoredMonForReview } from './optimize';
import type { Pokemon, StatKey } from '../types';
import type { SmogonSpeciesIntel } from '../smogon';

const moveIds = (...names: string[]) =>
  names.map((n) => ({ learn: 'tm', move: n.toLowerCase().replace(/[^a-z0-9]/g, '') }));

const species: Pokemon = {
  id: 'greattusk',
  name: 'Great Tusk',
  dex: 984,
  types: ['Ground', 'Fighting'],
  abilities: ['Protosynthesis'],
  hiddenAbilities: [],
  baseStats: { hp: 115, atk: 131, def: 131, spa: 53, spd: 53, spe: 87 },
  eggGroups: [],
  height: 22,
  weight: 3200,
  labels: [],
  moves: moveIds('Headlong Rush', 'Close Combat', 'Knock Off', 'Rapid Spin', 'Ice Spinner', 'Stealth Rock', 'Earthquake', 'Bulk Up'),
};

const intel: SmogonSpeciesIntel = {
  name: 'Great Tusk',
  usage: 0.3,
  rank: 1,
  abilities: [{ name: 'Protosynthesis', pct: 100 }],
  items: [
    { name: 'Booster Energy', pct: 45 },
    { name: 'Heavy-Duty Boots', pct: 30 },
    { name: 'Leftovers', pct: 12 },
  ],
  spreads: [
    { nature: 'Jolly', evs: [0, 252, 4, 0, 0, 252], pct: 55 },
    { nature: 'Jolly', evs: [252, 0, 0, 0, 4, 252], pct: 20 },
  ],
  moves: [
    { name: 'Headlong Rush', pct: 80 },
    { name: 'Rapid Spin', pct: 70 },
    { name: 'Close Combat', pct: 60 },
    { name: 'Knock Off', pct: 55 },
    { name: 'Ice Spinner', pct: 40 },
    { name: 'Stealth Rock', pct: 30 },
    { name: 'Bulk Up', pct: 2 },
  ],
  teraTypes: [],
  teammates: [],
  checks: [],
};

const evObj = (arr: number[]): Record<StatKey, number> => ({
  hp: arr[0], atk: arr[1], def: arr[2], spa: arr[3], spd: arr[4], spe: arr[5],
});

const optimalMon: StoredMonForReview = {
  moves: ['Headlong Rush', 'Rapid Spin', 'Close Combat', 'Knock Off'],
  nature: 'Jolly',
  item: 'Booster Energy',
  ability: 'Protosynthesis',
  evs: evObj([0, 252, 4, 0, 0, 252]),
};

describe('reviewStoredMon', () => {
  it('returns nothing when the set matches the meta', () => {
    expect(reviewStoredMon(optimalMon, species, intel)).toEqual([]);
  });

  it('returns nothing without intel', () => {
    expect(reviewStoredMon(optimalMon, species, null)).toEqual([]);
  });

  it('flags a missing core move (>=50% usage) and offers to add it', () => {
    const mon = { ...optimalMon, moves: ['Headlong Rush', 'Rapid Spin', 'Close Combat', 'Bulk Up'] };
    const res = reviewStoredMon(mon, species, intel);
    const missing = res.find((s) => s.title === 'Missing core move');
    expect(missing).toBeTruthy();
    expect(missing!.detail).toContain('Knock Off');
    expect(missing!.fix?.addMove).toBe('Knock Off');
  });

  it('does not flag a move that has a legitimate use case', () => {
    // Ice Spinner is 40% - below "core" but well above niche; never flagged as
    // rarely-used (dropping Knock Off is a separate missing-core concern).
    const mon = { ...optimalMon, moves: ['Headlong Rush', 'Rapid Spin', 'Close Combat', 'Ice Spinner'] };
    const res = reviewStoredMon(mon, species, intel);
    expect(res.find((s) => s.title === 'Rarely-used move')).toBeUndefined();
  });

  it('flags a rarely-used move and suggests a common replacement', () => {
    const mon = { ...optimalMon, moves: ['Headlong Rush', 'Rapid Spin', 'Close Combat', 'Bulk Up'] };
    const res = reviewStoredMon(mon, species, intel);
    const niche = res.find((s) => s.title === 'Rarely-used move');
    expect(niche).toBeTruthy();
    expect(niche!.fix?.replaceMove).toBe('Bulk Up');
    expect(niche!.fix?.addMove).toBe('Knock Off');
  });

  it('flags an off-meta EV spread against the dominant build', () => {
    const mon = { ...optimalMon, evs: evObj([252, 0, 252, 0, 4, 0]) };
    const res = reviewStoredMon(mon, species, intel);
    const ev = res.find((s) => s.category === 'ev');
    expect(ev).toBeTruthy();
    expect(ev!.severity).toBe('high'); // top spread is 55% - dominant
    expect(ev!.fix?.evs).toEqual(evObj([0, 252, 4, 0, 0, 252]));
    expect(ev!.fix?.nature).toBe('Jolly');
  });

  it('flags an untrained mon as high severity', () => {
    const mon = { ...optimalMon, evs: evObj([0, 0, 0, 0, 0, 0]) };
    const res = reviewStoredMon(mon, species, intel);
    const ev = res.find((s) => s.category === 'ev');
    expect(ev?.title).toBe('No EVs invested');
    expect(ev?.severity).toBe('high');
  });

  it('accepts a spread with the same investment pattern but slightly different numbers', () => {
    const mon = { ...optimalMon, evs: evObj([0, 248, 8, 0, 0, 252]) };
    const res = reviewStoredMon(mon, species, intel);
    expect(res.find((s) => s.category === 'ev')).toBeUndefined();
  });

  it('flags an off-meta nature only when the spread shape is fine', () => {
    const mon = { ...optimalMon, nature: 'Adamant' }; // pattern matches, nature does not
    const res = reviewStoredMon(mon, species, intel);
    const nat = res.find((s) => s.category === 'nature');
    expect(nat).toBeTruthy();
    expect(nat!.fix?.nature).toBe('Jolly');
  });

  it('flags a missing held item', () => {
    const mon = { ...optimalMon, item: null };
    const res = reviewStoredMon(mon, species, intel);
    const item = res.find((s) => s.title === 'No held item');
    expect(item?.fix?.item).toBe('Booster Energy');
  });

  it('flags an off-meta item but not a viable one', () => {
    const offMeta = reviewStoredMon({ ...optimalMon, item: 'Choice Scarf' }, species, intel);
    expect(offMeta.find((s) => s.title === 'Off-meta item')).toBeTruthy();

    const viable = reviewStoredMon({ ...optimalMon, item: 'Leftovers' }, species, intel);
    expect(viable.find((s) => s.category === 'item')).toBeUndefined();
  });

  it('sorts the most severe suggestions first', () => {
    const mon = {
      ...optimalMon,
      moves: ['Headlong Rush', 'Rapid Spin', 'Close Combat', 'Bulk Up'],
      evs: evObj([0, 0, 0, 0, 0, 0]),
      item: null,
    };
    const res = reviewStoredMon(mon, species, intel);
    expect(res[0].severity).toBe('high');
  });
});

describe('reviewStoredMon - IVs', () => {
  // A special-attacker set whose closest curated set wants 0 Atk IV.
  const specialSpecies: Pokemon = {
    ...species,
    id: 'gholdengo',
    name: 'Gholdengo',
    moves: moveIds('Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Recover', 'Thunderbolt'),
  };
  const specialIntel: SmogonSpeciesIntel = {
    ...intel,
    name: 'Gholdengo',
    items: [{ name: 'Air Balloon', pct: 40 }],
    spreads: [{ nature: 'Timid', evs: [0, 0, 0, 252, 4, 252], pct: 80 }],
    moves: [
      { name: 'Make It Rain', pct: 95 },
      { name: 'Shadow Ball', pct: 80 },
      { name: 'Nasty Plot', pct: 70 },
      { name: 'Recover', pct: 60 },
    ],
    sets: {
      'Nasty Plot': {
        moves: [['Make It Rain'], ['Shadow Ball'], ['Nasty Plot'], ['Recover']],
        item: ['Air Balloon'],
        ability: 'Good as Gold',
        nature: 'Timid',
        evs: [0, 0, 0, 252, 4, 252],
        ivs: [31, 0, 31, 31, 31, 31],
      },
    },
  };
  const base: StoredMonForReview = {
    moves: ['Make It Rain', 'Shadow Ball', 'Nasty Plot', 'Recover'],
    nature: 'Timid',
    item: 'Air Balloon',
    ability: 'Good as Gold',
    evs: evObj([0, 0, 0, 252, 4, 252]),
  };

  it('flags a 31 Atk IV when the set wants 0 (medium, with a 0 fix)', () => {
    const res = reviewStoredMon({ ...base, ivs: evObj([31, 31, 31, 31, 31, 31]) }, specialSpecies, specialIntel);
    const iv = res.find((s) => s.category === 'iv');
    expect(iv).toBeTruthy();
    expect(iv!.severity).toBe('medium');
    expect(iv!.title).toBe('Atk IV too high');
    expect(iv!.fix?.ivs).toEqual({ atk: 0 });
  });

  it('flags "not low enough" when the Atk IV is reduced but above 0', () => {
    const res = reviewStoredMon({ ...base, ivs: evObj([31, 8, 31, 31, 31, 31]) }, specialSpecies, specialIntel);
    const iv = res.find((s) => s.category === 'iv');
    expect(iv?.title).toBe('Atk IV not low enough');
    expect(iv?.detail).toContain('8');
  });

  it('does not flag when the Atk IV already matches the set (0)', () => {
    const res = reviewStoredMon({ ...base, ivs: evObj([31, 0, 31, 31, 31, 31]) }, specialSpecies, specialIntel);
    expect(res.find((s) => s.category === 'iv')).toBeUndefined();
  });

  it('treats omitted IVs as a perfect 31 (so a 0-Atk set gets flagged)', () => {
    const res = reviewStoredMon(base, specialSpecies, specialIntel);
    expect(res.find((s) => s.category === 'iv')?.title).toBe('Atk IV too high');
  });
});

describe('assessReadiness', () => {
  it('is "ready" for a meta-standard set', () => {
    expect(assessReadiness(optimalMon, species, intel)).toBe('ready');
  });

  it('is "unknown" without intel', () => {
    expect(assessReadiness(optimalMon, species, null)).toBe('unknown');
  });

  it('is "minor" when only low/medium findings exist', () => {
    const mon = { ...optimalMon, item: 'Choice Scarf' }; // off-meta item = low severity
    expect(assessReadiness(mon, species, intel)).toBe('minor');
  });

  it('is "heavy" when there is a high-severity finding', () => {
    const mon = { ...optimalMon, evs: evObj([0, 0, 0, 0, 0, 0]) }; // no EVs = high
    expect(assessReadiness(mon, species, intel)).toBe('heavy');
  });
});

describe('formatEvs', () => {
  it('lists invested stats in stat order', () => {
    expect(formatEvs([252, 0, 4, 0, 0, 252])).toBe('252 HP / 4 Def / 252 Spe');
  });
  it('reports an empty spread', () => {
    expect(formatEvs([0, 0, 0, 0, 0, 0])).toBe('no EVs');
  });
});
