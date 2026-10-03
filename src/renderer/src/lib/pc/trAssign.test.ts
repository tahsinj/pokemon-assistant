import { describe, it, expect } from 'vitest';
import { assignTr } from './trAssign';
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

describe('assignTr', () => {
  it('returns null for a move not in the dataset', () => {
    expect(assignTr('hyperbeam', [], {}, MOVES, null)).toBeNull();
  });

  it('ranks mons that want the TM above those that merely can learn it', () => {
    const pokemonById = {
      tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]),
      pidgey: mon('pidgey', [{ learn: 'tutor', move: 'knockoff' }]),
    };
    const smogon = bundle({
      tyranitar: intel(0.12, [{ name: 'Knock Off', pct: 85 }]),
      pidgey: intel(0.001, []), // can learn it, nobody runs it
    });

    const res = assignTr(
      'knockoff',
      [
        { slot: 0, speciesId: 'tyranitar', moves: ['Crunch'] },
        { slot: 1, speciesId: 'pidgey', moves: ['Tackle'] },
      ],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(res).not.toBeNull();
    expect(res!.candidates.map((c) => c.speciesId)).toEqual(['tyranitar', 'pidgey']);
    expect(res!.candidates[0].tier).toBe('high');
    expect(res!.candidates[0].moveUsagePct).toBe(85);
  });

  it('excludes mons that already run the move (lists them separately)', () => {
    const pokemonById = { tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]) };
    const smogon = bundle({ tyranitar: intel(0.12, [{ name: 'Knock Off', pct: 85 }]) });

    const res = assignTr(
      'knockoff',
      [{ slot: 3, speciesId: 'tyranitar', nickname: 'Rocky', moves: ['Knock Off'] }],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(res!.candidates).toHaveLength(0);
    expect(res!.alreadyKnow).toEqual([{ slot: 3, speciesName: 'Tyranitar', nickname: 'Rocky' }]);
  });

  it('counts mons that cannot be taught the move', () => {
    const pokemonById = {
      tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]),
      // only learns it by level-up - not a TM, so not teachable
      magikarp: mon('magikarp', [{ learn: '15', move: 'knockoff' }]),
    };
    const smogon = bundle({ tyranitar: intel(0.12, [{ name: 'Knock Off', pct: 85 }]) });

    const res = assignTr(
      'knockoff',
      [
        { slot: 0, speciesId: 'tyranitar', moves: ['Crunch'] },
        { slot: 1, speciesId: 'magikarp', moves: ['Splash'] },
      ],
      pokemonById,
      MOVES,
      smogon,
    );

    expect(res!.candidates.map((c) => c.speciesId)).toEqual(['tyranitar']);
    expect(res!.cannotLearnCount).toBe(1);
  });

  it('boosts a mon that sits on a saved team', () => {
    const pokemonById = {
      tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]),
      weavile: mon('weavile', [{ learn: 'tm', move: 'knockoff' }]),
    };
    // Same move usage + species usage, so team membership is the tiebreaker.
    const smogon = bundle({
      tyranitar: intel(0.1, [{ name: 'Knock Off', pct: 60 }]),
      weavile: intel(0.1, [{ name: 'Knock Off', pct: 60 }]),
    });

    const res = assignTr(
      'knockoff',
      [
        { slot: 0, speciesId: 'tyranitar', moves: ['Crunch'] },
        { slot: 1, speciesId: 'weavile', moves: ['Crunch'] },
      ],
      pokemonById,
      MOVES,
      smogon,
      new Set(['weavile']),
    );

    expect(res!.candidates[0].speciesId).toBe('weavile');
    expect(res!.candidates[0].onTeam).toBe(true);
    expect(res!.candidates[0].score).toBeGreaterThan(res!.candidates[1].score);
  });

  it('still surfaces a learnable mon when no usage data exists', () => {
    const pokemonById = { tyranitar: mon('tyranitar', [{ learn: 'tm', move: 'knockoff' }]) };

    const res = assignTr(
      'knockoff',
      [{ slot: 0, speciesId: 'tyranitar', moves: ['Crunch'] }],
      pokemonById,
      MOVES,
      null,
    );

    expect(res!.candidates).toHaveLength(1);
    expect(res!.candidates[0].moveUsagePct).toBe(0);
    expect(res!.candidates[0].reason).toMatch(/learnable/i);
  });
});
