import { describe, expect, it } from 'vitest';
import { topPcCounters } from './pcCounters';
import type { Pokemon, Move } from './types';
import type { PcPokemonRecord } from './bridgeTypes';

const mon = (id: string, types: string[], over: Partial<Pokemon> = {}): Pokemon =>
  ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    dex: 1,
    types,
    abilities: [],
    hiddenAbilities: [],
    baseStats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    eggGroups: [],
    moves: [],
    height: 10,
    weight: 100,
    labels: [],
    ...over,
  }) as Pokemon;

const charizard = mon('charizard', ['fire', 'flying'], {
  moves: [
    { learn: '1', move: 'flamethrower' },
    { learn: '1', move: 'scratch' },
  ],
});
const bulbasaur = mon('bulbasaur', ['grass', 'poison'], {
  baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 },
});

const MOVES: Record<string, Move> = {
  flamethrower: { id: 'flamethrower', name: 'Flamethrower', type: 'fire', category: 'Special', power: 90, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: [] },
  scratch: { id: 'scratch', name: 'Scratch', type: 'normal', category: 'Physical', power: 40, accuracy: 100, pp: 35, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
};

const FLAT = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

const rec = (id: string, speciesId: string, level: number, moves: string[] = []): PcPokemonRecord => ({
  id,
  boxId: 'box1',
  slot: 0,
  speciesId,
  speciesDisplay: speciesId,
  nickname: null,
  level,
  gender: 'male',
  nature: 'Serious',
  ability: '',
  item: null,
  ivs: { ...MAX_IVS },
  evs: { ...FLAT },
  moves,
  notes: null,
  shiny: false,
  updatedAt: 0,
});

const pokemonById = { charizard, bulbasaur };

describe('topPcCounters', () => {
  it('excludes badly underleveled mons (no lvl 1 Charizard vs lvl 50 target)', () => {
    const { results, underleveled } = topPcCounters(
      bulbasaur,
      [rec('a', 'charizard', 1, ['Flamethrower']), rec('b', 'charizard', 50, ['Flamethrower'])],
      pokemonById,
      MOVES,
      { targetLevel: 50 },
    );
    expect(results.map((r) => r.rec.id)).toEqual(['b']);
    expect(underleveled).toBe(1);
  });

  it('ranks a higher-level copy above a lower-level one', () => {
    const { results } = topPcCounters(
      bulbasaur,
      [rec('low', 'charizard', 40, ['Flamethrower']), rec('high', 'charizard', 70, ['Flamethrower'])],
      pokemonById,
      MOVES,
      { targetLevel: 50 },
    );
    expect(results[0].rec.id).toBe('high');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("scores with the record's actual moves, not the full learnset", () => {
    const { results } = topPcCounters(
      bulbasaur,
      [rec('weak', 'charizard', 50, ['Scratch']), rec('strong', 'charizard', 50, ['Flamethrower'])],
      pokemonById,
      MOVES,
      { targetLevel: 50 },
    );
    expect(results[0].rec.id).toBe('strong');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('falls back to the learnset when the record has no resolvable moves', () => {
    const { results } = topPcCounters(
      bulbasaur,
      [rec('nomoves', 'charizard', 50)],
      pokemonById,
      MOVES,
      { targetLevel: 50 },
    );
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('skips records whose species is unknown', () => {
    const { results } = topPcCounters(
      bulbasaur,
      [rec('ghost', 'missingno', 50, ['Flamethrower'])],
      pokemonById,
      MOVES,
      { targetLevel: 50 },
    );
    expect(results).toHaveLength(0);
  });
});
