import { describe, it, expect } from 'vitest';
import { offensiveCoverage, threatSummary } from './coverageProfile';
import type { Pokemon, Move } from './types';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';

const mk = (id: string, name: string, type: string, power: number, category = 'Physical'): Move =>
  ({ id, name, type, power, category, accuracy: 100, pp: 10, priority: 0, flags: [] } as unknown as Move);
const moves: Record<string, Move> = {
  earthquake: mk('earthquake', 'Earthquake', 'Ground', 100),
  dragonclaw: mk('dragonclaw', 'Dragon Claw', 'Dragon', 80),
  stealthrock: { id: 'stealthrock', name: 'Stealth Rock', type: 'Rock', power: 0, category: 'Status', accuracy: true, pp: 20, priority: 0, flags: [] } as unknown as Move,
  firefang: mk('firefang', 'Fire Fang', 'Fire', 65),
  icefang: mk('icefang', 'Ice Fang', 'Ice', 65),
  surf: mk('surf', 'Surf', 'Water', 90, 'Special'),
};

const garchomp = {
  id: 'garchomp', name: 'Garchomp', dex: 445, types: ['Dragon', 'Ground'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  abilities: ['Rough Skin'],
  moves: [
    { move: 'earthquake', learn: 'level' }, { move: 'dragonclaw', learn: 'level' },
    { move: 'stealthrock', learn: 'tm' }, { move: 'icefang', learn: 'level' },
  ],
} as unknown as Pokemon;

const garchompIntel = {
  name: 'Garchomp', usage: 0.2, rank: 1,
  abilities: [{ name: 'Rough Skin', pct: 100 }], items: [], spreads: [], teraTypes: [], teammates: [], checks: [],
  moves: [
    { name: 'Earthquake', pct: 95 }, { name: 'Dragon Claw', pct: 70 },
    { name: 'Stealth Rock', pct: 55 }, { name: 'Ice Fang', pct: 40 },
  ],
} as unknown as SmogonSpeciesIntel;

describe('offensiveCoverage - usage data', () => {
  const cov = offensiveCoverage(garchomp, moves, garchompIntel);

  it('reports probabilities from usage shares', () => {
    expect(cov.hasUsage).toBe(true);
  });

  it('covers Fire (Ground SE) at the Earthquake usage share', () => {
    const fire = cov.entries.find((e) => e.type === 'fire');
    expect(fire).toBeTruthy();
    expect(fire!.prob).toBeCloseTo(0.95);
    expect(fire!.via).toBe('Earthquake');
    expect(fire!.stab).toBe(true); // Ground is STAB for Garchomp
  });

  it('covers Flying only via the rarer Ice Fang, at its lower share', () => {
    // Ice hits Flying SE; Ground is 0×, Dragon neutral - so Ice Fang is the sole
    // option and its 0.40 share carries through.
    const flying = cov.entries.find((e) => e.type === 'flying');
    expect(flying).toBeTruthy();
    expect(flying!.via).toBe('Ice Fang');
    expect(flying!.prob).toBeCloseTo(0.4);
  });

  it('ignores non-damaging moves (Stealth Rock gives no Rock coverage by itself)', () => {
    // Garchomp has no damaging Rock move here, so Bug/Flying/etc Rock-SE comes
    // only from real damaging moves - Stealth Rock (power 0) must not count.
    const viaRock = cov.entries.some((e) => e.via === 'Stealth Rock');
    expect(viaRock).toBe(false);
  });

  it('sorts highest-probability coverage first', () => {
    const probs = cov.entries.map((e) => e.prob ?? 0);
    for (let i = 1; i < probs.length; i++) expect(probs[i]).toBeLessThanOrEqual(probs[i - 1]);
  });
});

describe('offensiveCoverage - learnset fallback', () => {
  it('marks no usage and emits null probabilities', () => {
    const cov = offensiveCoverage(garchomp, moves, null);
    expect(cov.hasUsage).toBe(false);
    expect(cov.entries.every((e) => e.prob === null)).toBe(true);
    // Still finds Fire coverage (Earthquake/Ground hits Fire) and Dragon (Ice Fang).
    expect(cov.entries.some((e) => e.type === 'fire')).toBe(true);
    expect(cov.entries.some((e) => e.type === 'dragon')).toBe(true);
  });
});

// ── Threat summary ──────────────────────────────────────────────────────────

// A slow Dragon/Ground (Garchomp), threatened by Ice (4×) and Dragon/Fairy.
const slowMon = {
  id: 'flygon', name: 'Flygon', dex: 330, types: ['Dragon', 'Ground'],
  baseStats: { hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 100 },
  abilities: ['Levitate'], moves: [],
} as unknown as Pokemon;

// A fast Ice attacker that outspeeds and carries an Ice move -> fast threat, 4×.
const fastIce = {
  id: 'weavile', name: 'Weavile', dex: 461, types: ['Dark', 'Ice'],
  baseStats: { hp: 70, atk: 120, def: 65, spa: 45, spd: 85, spe: 125 },
  abilities: ['Pressure'], moves: [],
} as unknown as Pokemon;

// A slow Ice attacker - relevant to the type summary but not a "fast threat".
const slowIce = {
  id: 'glalie', name: 'Glalie', dex: 362, types: ['Ice'],
  baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
  abilities: ['Inner Focus'], moves: [],
} as unknown as Pokemon;

const smogon = {
  meta: {} as SmogonBundle['meta'],
  species: {
    weavile: {
      name: 'Weavile', usage: 0.15, moves: [{ name: 'Ice Fang', pct: 90 }, { name: 'Surf', pct: 5 }],
      abilities: [], items: [], spreads: [], teraTypes: [], teammates: [], checks: [], rank: 2,
    } as unknown as SmogonSpeciesIntel,
    glalie: {
      name: 'Glalie', usage: 0.05, moves: [{ name: 'Ice Fang', pct: 80 }],
      abilities: [], items: [], spreads: [], teraTypes: [], teammates: [], checks: [], rank: 50,
    } as unknown as SmogonSpeciesIntel,
  },
} as unknown as SmogonBundle;

describe('threatSummary', () => {
  const all = [slowMon, fastIce, slowIce];
  const summary = threatSummary(slowMon, all, smogon, moves);

  it('flags the faster Ice attacker as a fast threat with the right type/mult', () => {
    expect(summary.fastThreats.map((t) => t.id)).toContain('weavile');
    const w = summary.fastThreats.find((t) => t.id === 'weavile')!;
    expect(w.viaType).toBe('ice');
    expect(w.mult).toBe(4); // Ice vs Dragon/Ground
  });

  it('does not list the slower Ice attacker as a fast threat', () => {
    expect(summary.fastThreats.some((t) => t.id === 'glalie')).toBe(false);
  });

  it('still surfaces Ice as the top risky type (slow attackers count, less)', () => {
    expect(summary.riskyTypes[0].type).toBe('ice');
    expect(summary.riskyTypes[0].mult).toBe(4);
    // Both the fast and slow Ice users show up as examples.
    const names = summary.riskyTypes[0].examples.map((e) => e.name);
    expect(names).toContain('Weavile');
  });

  it('faster examples are listed before slower ones', () => {
    const ice = summary.riskyTypes[0].examples;
    const wIdx = ice.findIndex((e) => e.name === 'Weavile');
    const gIdx = ice.findIndex((e) => e.name === 'Glalie');
    if (wIdx >= 0 && gIdx >= 0) expect(wIdx).toBeLessThan(gIdx);
  });
});
