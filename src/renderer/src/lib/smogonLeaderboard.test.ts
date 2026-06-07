import { describe, it, expect } from 'vitest';
import { buildLeaderboard, maxUsage } from './smogonLeaderboard';
import type { Pokemon } from './types';
import type { SmogonBundle } from './smogon';

function mon(id: string, name: string, types: string[], statTotal: number): Pokemon {
  const each = Math.round(statTotal / 6);
  return {
    id,
    name,
    dex: 1,
    types,
    baseStats: { hp: each, atk: each, def: each, spa: each, spd: each, spe: each },
  } as Pokemon;
}

const pokemonById: Record<string, Pokemon> = {
  alomomola: mon('alomomola', 'Alomomola', ['Water'], 470),
  gholdengo: mon('gholdengo', 'Gholdengo', ['Steel', 'Ghost'], 550),
  garchomp: mon('garchomp', 'Garchomp', ['Dragon', 'Ground'], 600),
};

const bundle = {
  meta: { format: 'gen9nationaldex', label: 'NatDex OU', month: '2026-05', cutoff: 1630, battles: 1, fetchedAt: '' },
  species: {
    gholdengo: { name: 'Gholdengo', usage: 0.17, rank: 2 },
    alomomola: { name: 'Alomomola', usage: 0.19, rank: 1 },
    garchomp: { name: 'Garchomp', usage: 0.09, rank: 9 },
    // present in bundle but absent from the dex - must be skipped:
    koraidon: { name: 'Koraidon', usage: 0.5, rank: 0 },
  },
} as unknown as SmogonBundle;

describe('buildLeaderboard', () => {
  it('sorts by usage descending by default and skips species absent from the dex', () => {
    const out = buildLeaderboard(bundle, pokemonById);
    expect(out.map((e) => e.pokemon.id)).toEqual(['alomomola', 'gholdengo', 'garchomp']);
  });

  it('sorts alphabetically', () => {
    const out = buildLeaderboard(bundle, pokemonById, { sort: 'alpha' });
    expect(out.map((e) => e.pokemon.name)).toEqual(['Alomomola', 'Garchomp', 'Gholdengo']);
  });

  it('sorts by base-stat total descending', () => {
    const out = buildLeaderboard(bundle, pokemonById, { sort: 'bst' });
    expect(out.map((e) => e.pokemon.id)).toEqual(['garchomp', 'gholdengo', 'alomomola']);
  });

  it('filters by type (case-insensitive)', () => {
    const out = buildLeaderboard(bundle, pokemonById, { type: 'ghost' });
    expect(out.map((e) => e.pokemon.id)).toEqual(['gholdengo']);
  });

  it('filters by name search (substring, case-insensitive)', () => {
    const out = buildLeaderboard(bundle, pokemonById, { search: 'gar' });
    expect(out.map((e) => e.pokemon.id)).toEqual(['garchomp']);
  });

  it('maxUsage returns the largest usage among entries', () => {
    expect(maxUsage(buildLeaderboard(bundle, pokemonById))).toBeCloseTo(0.19);
  });
});
