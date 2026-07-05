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
  return { slot: 0, speciesId: 'garchomp', speciesDisplay: 'Garchomp', item: null, ability: null, nature: null, level: null, ivs: null, evs: null, moves: null, ...over };
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

  it('shows the level when the slot carries one (from a PC mon)', () => {
    expect(toHudTeam([member({ level: 73 })], pokemonById, moves)[0].lv).toBe(73);
  });

  it('leaves level undefined for a level-less build so the HUD hides it', () => {
    expect(toHudTeam([member({ level: null })], pokemonById, moves)[0].lv).toBeUndefined();
  });

  it('computes real stats from level/IVs/EVs/nature when level is known', () => {
    const m = toHudTeam([member({ level: 50 })], pokemonById, moves)[0];
    expect(m.statLevel).toBe(50);
    expect(m.levelAssumed).toBe(false);
    expect(m.stats.hp).toBe(183); // Garchomp base 108 @ L50, 31 IV, 0 EV
    expect(m.stats.atk).toBe(150); // base 130, Hardy (neutral)
    expect(m.bst).toBe(600); // base-stat total stays the species value
  });

  it('assumes Lv 100 (competitive default) for a level-less build', () => {
    const m = toHudTeam([member()], pokemonById, moves)[0];
    expect(m.statLevel).toBe(100);
    expect(m.levelAssumed).toBe(true);
    expect(m.lv).toBeUndefined(); // no fabricated level badge
    expect(m.stats).not.toEqual(garchomp.baseStats); // real computed stats, not base
    expect(m.stats.hp).toBe(357); // base 108 @ L100, 31 IV, 0 EV
  });

  it('applies a boosting nature to the right stat', () => {
    const neutral = toHudTeam([member({ level: 50, nature: 'Hardy' })], pokemonById, moves)[0];
    const adamant = toHudTeam([member({ level: 50, nature: 'Adamant' })], pokemonById, moves)[0];
    expect(adamant.stats.atk).toBeGreaterThan(neutral.stats.atk);
    expect(adamant.stats.spa).toBeLessThan(neutral.stats.spa);
  });

  it('resolves an id-form ability to the species display name', () => {
    expect(toHudTeam([member({ ability: 'roughskin' })], pokemonById, moves)[0].ability).toBe('Rough Skin');
    expect(toHudTeam([member({ ability: 'sandveil' })], pokemonById, moves)[0].ability).toBe('Sand Veil');
  });

  it('title-cases an unknown ability as a fallback', () => {
    expect(toHudTeam([member({ ability: 'some-ability' })], pokemonById, moves)[0].ability).toBe('Some Ability');
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
