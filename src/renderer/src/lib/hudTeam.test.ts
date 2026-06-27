import { describe, it, expect } from 'vitest';
import { toHudTeam } from './hudTeam';
import type { Pokemon, Move } from './types';
import type { TeamMemberPersist } from './bridgeTypes';

const garchomp: Pokemon = {
  id: 'garchomp', name: 'Garchomp', dex: 445,
  types: ['Dragon', 'Ground'], abilities: ['Rough Skin'], hiddenAbilities: ['Sand Veil'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: [], height: 1.9, weight: 95, labels: [], moves: [],
};
const pokemonById = { garchomp };

const moves: Record<string, Move> = {
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical', power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'allAdjacent', flags: [] },
  swordsdance: { id: 'swordsdance', name: 'Swords Dance', type: 'normal', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: [] },
};

function member(over: Partial<TeamMemberPersist> = {}): TeamMemberPersist {
  return { slot: 0, speciesId: 'garchomp', speciesDisplay: 'Garchomp', item: null, ability: null, nature: null, evs: null, moves: null, ...over };
}

describe('toHudTeam', () => {
  it('maps a member to a HUD mon with resolved moves and zero-padded dex', () => {
    const team = toHudTeam([member({ moves: ['Earthquake', 'Swords Dance'], item: 'Loaded Dice', nature: 'Jolly' })], pokemonById, moves);
    expect(team).toHaveLength(1);
    const m = team[0];
    expect(m.name).toBe('Garchomp');
    expect(m.dex).toBe('#0445');
    expect(m.types).toEqual(['dragon', 'ground']);
    expect(m.item).toBe('Loaded Dice');
    expect(m.nature).toBe('Jolly');
    expect(m.moves.map((mv) => mv.name)).toEqual(['Earthquake', 'Swords Dance']);
    expect(m.moves[1].cat).toBe('-'); // status
    expect(m.moves[1].acc).toBe(100); // accuracy:true normalized
  });

  it('falls back to the first ability when the member has none', () => {
    const team = toHudTeam([member()], pokemonById, moves);
    expect(team[0].ability).toBe('Rough Skin');
  });

  it('skips empty slots and unknown species', () => {
    const team = toHudTeam(
      [member({ slot: 0, speciesId: null }), member({ slot: 1, speciesId: 'missingno' })],
      pokemonById,
      moves,
    );
    expect(team).toHaveLength(0);
  });

  it('ignores unresolved move names without crashing', () => {
    const team = toHudTeam([member({ moves: ['Earthquake', 'Not A Move'] })], pokemonById, moves);
    expect(team[0].moves.map((mv) => mv.name)).toEqual(['Earthquake']);
  });
});
