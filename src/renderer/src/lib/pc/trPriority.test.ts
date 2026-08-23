import { describe, it, expect } from 'vitest';
import { computeTrPriorities, TR_MIN_MOVE_PCT } from './trPriority';
import type { Pokemon, Move } from '../types';
import type { SmogonBundle, SmogonSpeciesIntel } from '../smogon';

function mon(id: string, moves: { learn: string; move: string }[]): Pokemon {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    dex: 1,
    types: ['normal'],
    abilities: [],
    hiddenAbilities: [],
    baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
    eggGroups: [],
    moves,
  } as unknown as Pokemon;
}

function move(id: string, category: Move['category'] = 'Physical'): Move {
  return { id, name: id[0].toUpperCase() + id.slice(1), type: 'dark', category } as unknown as Move;
}

function intel(usage: number, moves: { name: string; pct: number }[]): SmogonSpeciesIntel {
  return {
    name: 'X',
    usage,
    rank: 1,
    abilities: [],
    items: [],
    spreads: [],
    moves: moves as SmogonSpeciesIntel['moves'],
    teraTypes: [],
    teammates: [],
    checks: [],
  };
}

function bundle(species: Record<string, SmogonSpeciesIntel>): SmogonBundle {
  return { meta: {} as SmogonBundle['meta'], species };
}

const MOVES: Record<string, Move> = {
  knockoff: move('knockoff'),
  crunch: move('crunch'),
  earthquake: move('earthquake'),
};

describe('computeTrPriorities', () => {
  it('flags a heavily-used taught move the mon is missing', () => {
    const pokemonById = { tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]) };
    const smogon = bundle({ tyranitar: intel(0.1, [{ name: 'Knock Off', pct: 80 }]) });

    const out = computeTrPriorities(
      [{ speciesId: 'tyranitar', moves: ['Crunch', 'Earthquake'] }],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(out).toHaveLength(1);
    expect(out[0].moveId).toBe('knockoff');
    expect(out[0].wantedBy[0].speciesId).toBe('tyranitar');
    expect(out[0].score).toBeGreaterThan(0);
  });

  it('ignores moves the mon already runs', () => {
    const pokemonById = { tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]) };
    const smogon = bundle({ tyranitar: intel(0.1, [{ name: 'Knock Off', pct: 80 }]) });

    const out = computeTrPriorities(
      [{ speciesId: 'tyranitar', moves: ['Knock Off'] }],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(out).toHaveLength(0);
  });

  it('only counts taught (tm/tutor) moves, not level-up or egg moves', () => {
    const pokemonById = {
      tyranitar: mon('tyranitar', [
        { learn: '15', move: 'crunch' }, // level-up: free, not a TR
        { learn: 'egg', move: 'knockoff' }, // egg: bred, not a TR
      ]),
    };
    const smogon = bundle({
      tyranitar: intel(0.1, [
        { name: 'Crunch', pct: 90 },
        { name: 'Knock Off', pct: 90 },
      ]),
    });

    const out = computeTrPriorities(
      [{ speciesId: 'tyranitar', moves: ['Earthquake'] }],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(out).toHaveLength(0);
  });

  it('drops moves below the usage threshold', () => {
    const pokemonById = { tyranitar: mon('tyranitar', [{ learn: 'tutor', move: 'knockoff' }]) };
    const smogon = bundle({ tyranitar: intel(0.1, [{ name: 'Knock Off', pct: TR_MIN_MOVE_PCT - 1 }]) });

    const out = computeTrPriorities(
      [{ speciesId: 'tyranitar', moves: ['Crunch'] }],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(out).toHaveLength(0);
  });

  it('boosts a move wanted by a mon that is on a saved team', () => {
    const pokemonById = { tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]) };
    const smogon = bundle({ tyranitar: intel(0.1, [{ name: 'Knock Off', pct: 80 }]) });
    const base = computeTrPriorities(
      [{ speciesId: 'tyranitar', moves: ['Crunch'] }],
      pokemonById,
      MOVES,
      smogon,
    );
    const boosted = computeTrPriorities(
      [{ speciesId: 'tyranitar', moves: ['Crunch'] }],
      pokemonById,
      MOVES,
      smogon,
      new Set(['tyranitar']),
    );

    expect(boosted[0].score).toBeGreaterThan(base[0].score);
    expect(boosted[0].wantedBy[0].onTeam).toBe(true);
  });

  it('aggregates and ranks across multiple mons wanting the same TR', () => {
    const pokemonById = {
      tyranitar: mon('tyranitar', [
        { learn: 'tm', move: 'knockoff' },
        { learn: 'tm', move: 'earthquake' },
      ]),
      garchomp: mon('garchomp', [{ learn: 'tm', move: 'earthquake' }]),
    };
    const smogon = bundle({
      tyranitar: intel(0.1, [
        { name: 'Knock Off', pct: 80 },
        { name: 'Earthquake', pct: 60 },
      ]),
      garchomp: intel(0.15, [{ name: 'Earthquake', pct: 95 }]),
    });

    const out = computeTrPriorities(
      [
        { speciesId: 'tyranitar', moves: ['Crunch'] },
        { speciesId: 'garchomp', moves: ['Dragon Claw'] },
      ],
      pokemonById,
      MOVES,
      smogon,
    );

    // Earthquake is wanted by both mons, so it should aggregate to the top.
    expect(out[0].moveId).toBe('earthquake');
    expect(out[0].wantedBy).toHaveLength(2);
    expect(out.find((e) => e.moveId === 'knockoff')).toBeTruthy();
  });
});
