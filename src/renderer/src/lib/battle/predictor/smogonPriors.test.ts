import { describe, expect, it } from 'vitest';
import { buildSmogonSetPool } from './smogonPriors';
import { generateCandidateSets } from './setGenerator';
import type { Pokemon } from '../../types';
import type { SmogonBundle, SmogonSpeciesIntel } from '../../smogon';

const learn = (...ids: string[]) => ids.map((m) => ({ learn: 'level', move: m }));

const garchomp: Pokemon = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['roughskin', 'sandveil'],
  hiddenAbilities: [],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: [],
  height: 19,
  weight: 950,
  labels: [],
  moves: learn('swordsdance', 'earthquake', 'stoneedge', 'stealthrock', 'scaleshot', 'firefang'),
} as unknown as Pokemon;

const intel = (over: Partial<SmogonSpeciesIntel>): SmogonSpeciesIntel => ({
  name: 'Garchomp',
  usage: 0.11,
  rank: 12,
  abilities: [{ name: 'Rough Skin', pct: 100 }],
  items: [
    { name: 'Loaded Dice', pct: 26 },
    { name: 'Rocky Helmet', pct: 21 },
  ],
  spreads: [{ nature: 'Jolly', evs: [0, 252, 0, 0, 4, 252], pct: 31 }],
  moves: [
    { name: 'Earthquake', pct: 99 },
    { name: 'Stealth Rock', pct: 56 },
    { name: 'Swords Dance', pct: 51 },
    { name: 'Scale Shot', pct: 34 },
    { name: 'Surf', pct: 30 }, // not learnable in our dataset
  ],
  teraTypes: [],
  teammates: [],
  checks: [],
  ...over,
});

const bundle = (species: Record<string, SmogonSpeciesIntel>): SmogonBundle => ({
  meta: { format: 'gen9nationaldex', label: 'NatDex OU', month: '2026-05', cutoff: 1630, battles: 1, fetchedAt: '' },
  species,
});

describe('buildSmogonSetPool', () => {
  it('builds curated sets plus a usage-default candidate, priors normalized', () => {
    const b = bundle({
      garchomp: intel({
        sets: {
          'Swords Dance': {
            moves: [['Swords Dance'], ['Earthquake'], ['Outrage', 'Stone Edge'], ['Stealth Rock']],
            item: ['Loaded Dice'],
            ability: 'Rough Skin',
            nature: 'Jolly',
            evs: [0, 252, 0, 0, 4, 252],
          },
        },
      }),
    });
    const pool = buildSmogonSetPool(b, { garchomp });
    const sets = pool.garchomp;
    expect(sets).toHaveLength(2); // curated + usage default
    const sd = sets.find((s) => s.label.includes('Swords Dance'))!;
    // Slashed slot: Outrage isn't learnable, Stone Edge is -> Stone Edge picked.
    expect(sd.moves).toContain('Stone Edge');
    expect(sd.moves).not.toContain('Outrage');
    expect(sd.nature).toBe('Jolly');
    expect(sd.evs.atk).toBe(252);
    const total = sets.reduce((a, s) => a + s.prior, 0);
    expect(total).toBeGreaterThan(0.99);
    expect(total).toBeLessThan(1.01);
  });

  it('usage-default set only contains learnable top moves', () => {
    const pool = buildSmogonSetPool(bundle({ garchomp: intel({}) }), { garchomp });
    const dflt = pool.garchomp.find((s) => s.label.includes('usage'))!;
    expect(dflt.moves).toEqual(['Earthquake', 'Stealth Rock', 'Swords Dance', 'Scale Shot']);
    expect(dflt.item).toBe('Loaded Dice');
    expect(dflt.nature).toBe('Jolly');
  });

  it('skips species without intel and drops unlearnable curated sets', () => {
    const b = bundle({
      garchomp: intel({
        sets: {
          Unusable: {
            moves: [['Hydro Pump'], ['Ice Beam']],
            item: [],
            ability: null,
            nature: null,
            evs: [0, 0, 0, 0, 0, 0],
          },
        },
      }),
    });
    const pool = buildSmogonSetPool(b, { garchomp });
    expect(pool.garchomp.some((s) => s.label.includes('Unusable'))).toBe(false);
    expect(pool.other).toBeUndefined();
  });

  it('feeds the set generator through PredictorContext.customSetPool', () => {
    const pool = buildSmogonSetPool(bundle({ garchomp: intel({}) }), { garchomp });
    const out = generateCandidateSets(garchomp, {
      pokemonByName: { garchomp },
      moves: {},
      customSetPool: pool,
    });
    expect(out.every((s) => s.id.includes(':smogon:'))).toBe(true);
    expect(out.reduce((a, s) => a + s.prior, 0)).toBeCloseTo(1, 5);
  });

  it('prefers the more-used slashed item per chaos stats', () => {
    const b = bundle({
      garchomp: intel({
        sets: {
          Slashed: {
            moves: [['Earthquake']],
            item: ['Rocky Helmet', 'Loaded Dice'], // Loaded Dice more used (26 > 21)
            ability: 'Rough Skin',
            nature: 'Jolly',
            evs: [0, 252, 0, 0, 4, 252],
          },
        },
      }),
    });
    const pool = buildSmogonSetPool(b, { garchomp });
    const s = pool.garchomp.find((x) => x.label.includes('Slashed'))!;
    expect(s.item).toBe('Loaded Dice');
  });
});
