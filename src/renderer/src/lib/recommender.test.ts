import { describe, expect, it } from 'vitest';
import { competitiveMoveset, learnableMoves, offensiveBias, scoreMove, suggestMoveset, tmPriorities } from './recommender';
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
    // Usage leads: Giga Drain (79%) above Earth Power (absent from intel)
    expect(ids.indexOf('gigadrain')).toBeLessThan(ids.indexOf('earthpower'));
    // Ladder usage is the primary sort key (mechanical score only breaks ties).
    const usage = (id: string) => intel.moves.find((m) => m.name.toLowerCase().replace(/[^a-z0-9]/g, '') === id)?.pct ?? 0;
    for (let i = 1; i < out.length; i++) expect(usage(out[i - 1].move.id)).toBeGreaterThanOrEqual(usage(out[i].move.id));
  });

  it('respects the limit', () => {
    expect(tmPriorities(venusaur, MOVES, null, 2)).toHaveLength(2);
  });
});

describe('tmPriorities - usage leads, redundant attacks pruned', () => {
  // Garchomp-shaped: physical Dragon/Ground. Earthquake (99%) and Stealth Rock
  // (56%) are its two staple TMs; the rest of the TM pool is redundant chip the
  // ladder doesn't run and a level-up move already covers.
  const M: Record<string, Move> = {
    dragonclaw: { id: 'dragonclaw', name: 'Dragon Claw', type: 'dragon', category: 'Physical', power: 80, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
    earthquake: { id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical', power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
    stealthrock: { id: 'stealthrock', name: 'Stealth Rock', type: 'rock', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'foeSide', flags: [] },
    breakingswipe: { id: 'breakingswipe', name: 'Breaking Swipe', type: 'dragon', category: 'Physical', power: 60, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
    stoneedge: { id: 'stoneedge', name: 'Stone Edge', type: 'rock', category: 'Physical', power: 100, accuracy: 80, pp: 5, priority: 0, desc: '', target: 'normal', flags: [] },
  };
  const chomp: Pokemon = {
    ...venusaur,
    id: 'garchomp',
    types: ['dragon', 'ground'],
    baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    moves: [
      { learn: '34', move: 'dragonclaw' },
      { learn: 'tm', move: 'earthquake' },
      { learn: 'tm', move: 'stealthrock' },
      { learn: 'tm', move: 'breakingswipe' },
      { learn: 'tm', move: 'stoneedge' },
    ],
  } as Pokemon;
  const chompIntel = {
    ...intel,
    name: 'Garchomp',
    moves: [
      { name: 'Earthquake', pct: 99.3 },
      { name: 'Stealth Rock', pct: 56.2 },
      { name: 'Stone Edge', pct: 15.4 },
    ],
  } as unknown as SmogonSpeciesIntel;

  it('ranks Stealth Rock (56% usage) second, above zero-usage STAB attacks', () => {
    const ids = tmPriorities(chomp, M, chompIntel).map((o) => o.move.id);
    expect(ids[0]).toBe('earthquake');
    expect(ids[1]).toBe('stealthrock');
  });

  it("drops a redundant TM attack a level-up move already beats (Breaking Swipe < Dragon Claw)", () => {
    const ids = tmPriorities(chomp, M, chompIntel).map((o) => o.move.id);
    expect(ids).not.toContain('breakingswipe');
    // …but a used / non-redundant coverage move survives.
    expect(ids).toContain('stoneedge');
  });

  it('falls back to mechanical score (and still prunes redundant attacks) with no intel', () => {
    const ids = tmPriorities(chomp, M, null).map((o) => o.move.id);
    expect(ids).not.toContain('breakingswipe'); // still redundant vs Dragon Claw
    expect(ids).toContain('earthquake');
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

describe('offensiveBias', () => {
  // Lucario-shaped: SpA ≥ Atk by raw stats, but the ladder runs it physical.
  const lucario = {
    ...venusaur,
    id: 'lucario',
    baseStats: { hp: 70, atk: 110, def: 70, spa: 115, spd: 70, spe: 90 },
  } as Pokemon;

  it('falls back to base stats without smogon data', () => {
    expect(offensiveBias(lucario, null)).toBe('special'); // spa 115 ≥ atk 110
  });

  it('prefers the ladder spreads over raw base stats', () => {
    const physIntel = {
      ...intel,
      spreads: [
        { nature: 'Adamant', evs: [4, 252, 0, 0, 0, 252], pct: 28 },
        { nature: 'Jolly', evs: [0, 252, 0, 0, 4, 252], pct: 16 },
        { nature: 'Timid', evs: [0, 0, 0, 252, 4, 252], pct: 11 },
      ],
    } as unknown as SmogonSpeciesIntel;
    expect(offensiveBias(lucario, physIntel)).toBe('physical');
  });
});

describe('setup-move prioritization', () => {
  // Lucario-shaped: Fighting/Steel physical sweeper. Two STAB slots + a priority
  // move fill three; Swords Dance (a used setup move) should claim the last slot
  // over a mediocre off-category coverage move (the reported Dragon Pulse bug).
  const sweeper: Pokemon = {
    ...venusaur,
    id: 'sweeper',
    types: ['fighting', 'steel'],
    baseStats: { hp: 70, atk: 120, def: 70, spa: 60, spd: 70, spe: 100 },
    moves: [
      { learn: '1', move: 'closecombat' },
      { learn: '48', move: 'meteormash' },
      { learn: '40', move: 'swordsdance' },
      { learn: '52', move: 'dragonpulse' },
      { learn: '56', move: 'extremespeed' },
    ],
  } as Pokemon;
  const M2: Record<string, Move> = {
    closecombat: { id: 'closecombat', name: 'Close Combat', type: 'fighting', category: 'Physical', power: 120, accuracy: 100, pp: 5, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
    meteormash: { id: 'meteormash', name: 'Meteor Mash', type: 'steel', category: 'Physical', power: 90, accuracy: 90, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
    swordsdance: { id: 'swordsdance', name: 'Swords Dance', type: 'normal', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: ['snatch'] },
    dragonpulse: { id: 'dragonpulse', name: 'Dragon Pulse', type: 'dragon', category: 'Special', power: 85, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
    extremespeed: { id: 'extremespeed', name: 'Extreme Speed', type: 'normal', category: 'Physical', power: 80, accuracy: 100, pp: 5, priority: 2, desc: '', target: 'normal', flags: ['contact'] },
  };
  const intel2 = {
    ...intel,
    moves: [{ name: 'Swords Dance', pct: 36.5 }],
  } as unknown as SmogonSpeciesIntel;

  it('keeps Swords Dance over an off-category coverage move', () => {
    const names = suggestMoveset(sweeper, M2, { pool: 'levelup', smogon: intel2 }).map((s) => s.move.id);
    expect(names).toContain('swordsdance');
    expect(names).not.toContain('dragonpulse');
  });

  it('scores a setup move above a junk status move', () => {
    const sd = scoreMove(sweeper, M2.swordsdance);
    const junk = scoreMove(sweeper, { ...M2.swordsdance, id: 'splash', name: 'Splash', flags: [] });
    expect(sd.score).toBeGreaterThan(junk.score);
    expect(sd.reasons).toContain('setup move');
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
