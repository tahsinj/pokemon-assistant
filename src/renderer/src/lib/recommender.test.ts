import { describe, expect, it } from 'vitest';
import { competitiveMoveset, learnableMoves, scoreMove, suggestMoveset, tmPriorities } from './recommender';
import type { Move, Pokemon } from './types';
import type { SmogonSet, SmogonSpeciesIntel } from './smogon';

const MOVES: Record<string, Move> = {
  tackle: { id: 'tackle', name: 'Tackle', type: 'normal', category: 'Physical', power: 40, accuracy: 100, pp: 35, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  vinewhip: { id: 'vinewhip', name: 'Vine Whip', type: 'grass', category: 'Physical', power: 45, accuracy: 100, pp: 25, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  gigadrain: { id: 'gigadrain', name: 'Giga Drain', type: 'grass', category: 'Special', power: 75, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['heal'] },
  sludgebomb: { id: 'sludgebomb', name: 'Sludge Bomb', type: 'poison', category: 'Special', power: 90, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
  earthpower: { id: 'earthpower', name: 'Earth Power', type: 'ground', category: 'Special', power: 90, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
  weatherball: { id: 'weatherball', name: 'Weather Ball', type: 'normal', category: 'Special', power: 50, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
  hyperbeam: { id: 'hyperbeam', name: 'Hyper Beam', type: 'normal', category: 'Special', power: 150, accuracy: 90, pp: 5, priority: 0, desc: '', target: 'normal', flags: ['recharge'] },
  solarbeam: { id: 'solarbeam', name: 'Solar Beam', type: 'grass', category: 'Special', power: 120, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['charge'] },
  growth: { id: 'growth', name: 'Growth', type: 'normal', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: ['snatch'] },
};

// Vine Whip is learnable BOTH by level and by tutor; Giga Drain is tm-only;
// Tackle level-only; Sludge Bomb tm; Earth Power tutor; Weather Ball egg.
const venusaur: Pokemon = {
  id: 'venusaur',
  name: 'Venusaur',
  dex: 3,
  types: ['grass', 'poison'],
  abilities: ['Overgrow'],
  hiddenAbilities: [],
  baseStats: { hp: 80, atk: 82, def: 83, spa: 100, spd: 100, spe: 80 },
  eggGroups: [],
  height: 20,
  weight: 1000,
  labels: [],
  moves: [
    { learn: '1', move: 'tackle' },
    { learn: '10', move: 'vinewhip' },
    { learn: 'tutor', move: 'vinewhip' },
    { learn: 'tm', move: 'gigadrain' },
    { learn: 'tm', move: 'sludgebomb' },
    { learn: 'tutor', move: 'earthpower' },
    { learn: 'egg', move: 'weatherball' },
  ],
} as unknown as Pokemon;

const intel = {
  name: 'Venusaur',
  usage: 0.015,
  rank: 86,
  abilities: [],
  items: [],
  spreads: [],
  moves: [
    { name: 'Weather Ball', pct: 91.3 },
    { name: 'Giga Drain', pct: 79 },
    { name: 'Sludge Bomb', pct: 74.8 },
  ],
  teraTypes: [],
  teammates: [],
  checks: [],
} as unknown as SmogonSpeciesIntel;

describe('learnableMoves pools', () => {
  it("'levelup' keeps only numeric learn tags", () => {
    const ids = learnableMoves(venusaur, MOVES, 'levelup').map((m) => m.id);
    expect(ids.sort()).toEqual(['tackle', 'vinewhip']);
  });

  it("'tm' keeps tm and tutor tags, including dual-tagged moves", () => {
    const ids = learnableMoves(venusaur, MOVES, 'tm').map((m) => m.id);
    expect(ids.sort()).toEqual(['earthpower', 'gigadrain', 'sludgebomb', 'vinewhip']);
  });

  it("'all' keeps everything (deduped)", () => {
    const ids = learnableMoves(venusaur, MOVES).map((m) => m.id);
    expect(ids.sort()).toEqual(['earthpower', 'gigadrain', 'sludgebomb', 'tackle', 'vinewhip', 'weatherball']);
  });
});

describe('scoreMove smogon bias', () => {
  it('adds capped ladder-usage bonus with a reason', () => {
    const without = scoreMove(venusaur, MOVES.gigadrain);
    const withIntel = scoreMove(venusaur, MOVES.gigadrain, intel);
    expect(withIntel.score - without.score).toBeCloseTo(60, 5); // 79% capped at 60
    expect(withIntel.reasons.join(' ')).toMatch(/79% ladder usage/);
  });

  it('moves outside the intel get no bonus', () => {
    const without = scoreMove(venusaur, MOVES.tackle);
    const withIntel = scoreMove(venusaur, MOVES.tackle, intel);
    expect(withIntel.score).toBe(without.score);
  });
});

describe('suggestMoveset', () => {
  it('without options behaves as before (full pool, no bias)', () => {
    const names = suggestMoveset(venusaur, MOVES).map((s) => s.move.id);
    expect(names).toHaveLength(4);
  });

  it('levelup pool never suggests tm/tutor/egg-only moves', () => {
    const names = suggestMoveset(venusaur, MOVES, { pool: 'levelup' }).map((s) => s.move.id);
    for (const n of names) expect(['tackle', 'vinewhip']).toContain(n);
  });

  it('smogon bias pulls ladder staples into the set', () => {
    const names = suggestMoveset(venusaur, MOVES, { smogon: intel }).map((s) => s.move.id);
    expect(names).toContain('weatherball');
  });
});

describe('tmPriorities', () => {
  it('ranks tm/tutor moves and excludes ones also learnable by level', () => {
    const out = tmPriorities(venusaur, MOVES, intel);
    const ids = out.map((o) => o.move.id);
    expect(ids).not.toContain('vinewhip'); // dual-tagged → comes free by level
    expect(ids).not.toContain('tackle');
    expect(ids).toContain('gigadrain');
    // Smogon-biased ordering: Giga Drain (79%) above Earth Power (absent from intel)
    expect(ids.indexOf('gigadrain')).toBeLessThan(ids.indexOf('earthpower'));
    for (let i = 1; i < out.length; i++) expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
  });

  it('respects the limit', () => {
    expect(tmPriorities(venusaur, MOVES, null, 2)).toHaveLength(2);
  });
});

describe('scoreMove drawback penalties', () => {
  it('a recharge move scores below an equivalent clean move despite higher BP', () => {
    // Hyper Beam (150 BP, recharge) vs Earth Power (90 BP, clean) - both Normal/
    // Ground non-STAB special hits for Venusaur. Recharge should sink it.
    const hyper = scoreMove(venusaur, MOVES.hyperbeam).score;
    const earth = scoreMove(venusaur, MOVES.earthpower).score;
    expect(hyper).toBeLessThan(earth);
  });

  it('charge moves take a penalty (Solar Beam vs Giga Drain)', () => {
    const solar = scoreMove(venusaur, MOVES.solarbeam);
    const giga = scoreMove(venusaur, MOVES.gigadrain);
    expect(solar.reasons).toContain('charge turn');
    expect(solar.score).toBeLessThan(giga.score); // both Grass STAB; charge sinks Solar Beam
  });

  it('soft-caps raw base power at 100', () => {
    // Hyper Beam 150 BP × 90% = 135 raw, but capped to 100 before penalties.
    const r = scoreMove(venusaur, MOVES.hyperbeam);
    // base 100 (capped) + special 20 − recharge 40 = 80
    expect(r.score).toBe(80);
  });
});

describe('suggestMoveset status cap', () => {
  it('never includes more than one status move', () => {
    // Pool with two appealing status moves (Growth + Vine Whip etc.).
    const mon: Pokemon = {
      ...venusaur,
      moves: [
        { learn: '1', move: 'growth' },
        { learn: '1', move: 'gigadrain' },
        { learn: '1', move: 'tackle' },
        { learn: '1', move: 'vinewhip' },
      ],
    } as Pokemon;
    const status = suggestMoveset(mon, { ...MOVES }).filter((s) => s.move.category === 'Status');
    expect(status.length).toBeLessThanOrEqual(1);
  });
});

describe('competitiveMoveset', () => {
  const sweeper: SmogonSet = {
    moves: [['Weather Ball'], ['Giga Drain'], ['Sludge Bomb'], ['Earth Power', 'Solar Beam']],
    item: ['Life Orb'],
    ability: 'Chlorophyll',
    nature: 'Modest',
    evs: [0, 0, 0, 252, 4, 252],
  };
  const tank: SmogonSet = {
    moves: [['Giga Drain'], ['Sludge Bomb'], ['Earth Power'], ['Tackle']],
    item: ['Black Sludge'],
    ability: 'Chlorophyll',
    nature: 'Bold',
    evs: [252, 0, 0, 156, 0, 100],
  };
  const intelSets = {
    ...intel,
    moves: [
      { name: 'Weather Ball', pct: 91.3 },
      { name: 'Growth', pct: 84.7 },
      { name: 'Giga Drain', pct: 79 },
      { name: 'Sludge Bomb', pct: 74.8 },
      { name: 'Earth Power', pct: 36.4 },
    ],
    sets: { Tank: tank, 'Chlorophyll Sweeper': sweeper },
  } as unknown as SmogonSpeciesIntel;

  it('reconstructs the most-used curated set, surfacing high-usage moves', () => {
    const out = competitiveMoveset(venusaur, MOVES, intelSets)!;
    const ids = out.map((m) => m.move.id);
    // Sweeper (WB91+Giga79+Sludge74+Earth36 = 281) beats Tank (Giga+Sludge+Earth = 190).
    expect(ids).toContain('weatherball');
    expect(ids).toContain('gigadrain');
    expect(ids).toHaveLength(4);
    expect(out[0].reasons.join(' ')).toMatch(/Smogon Chlorophyll Sweeper/);
  });

  it('falls back to usage marginals when there are no curated sets', () => {
    const out = competitiveMoveset(venusaur, MOVES, intel)!;
    // intel.moves = Weather Ball, Giga Drain, Sludge Bomb (all learnable here).
    expect(out.map((m) => m.move.id).sort()).toEqual(['gigadrain', 'sludgebomb', 'weatherball']);
  });

  it('returns null without smogon intel', () => {
    expect(competitiveMoveset(venusaur, MOVES, null)).toBeNull();
  });
});
