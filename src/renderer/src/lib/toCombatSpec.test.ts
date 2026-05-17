import { describe, expect, it } from 'vitest';
import { fromPcRecord, fromTeamMember, toCombatFields, toSessionSpec } from './toCombatSpec';
import type { Pokemon } from './types';
import type { PcPokemonRecord, TeamMemberPersist } from './bridgeTypes';

const garchomp = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin', 'Sand Veil'],
  hiddenAbilities: [],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: [],
  moves: [],
  height: 19,
  weight: 950,
  labels: [],
} as unknown as Pokemon;

const rec: PcPokemonRecord = {
  id: 'r1',
  boxId: 'b1',
  slot: 0,
  speciesId: 'garchomp',
  speciesDisplay: 'Garchomp',
  nickname: 'Chompy',
  level: 78,
  gender: 'male',
  nature: 'Jolly',
  ability: 'Rough Skin',
  item: 'Loaded Dice',
  ivs: { hp: 31, atk: 31, def: 20, spa: 0, spd: 25, spe: 31 },
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  moves: ['Earthquake', 'Scale Shot', 'Swords Dance'],
  notes: null,
  updatedAt: 0,
};

const FALLBACK = ['Outrage', 'Stone Edge', 'Fire Fang', 'Iron Head'];

describe('fromPcRecord → toCombatFields', () => {
  it('carries level, nature, ability, item, spreads, and pads moves from fallback', () => {
    const f = toCombatFields(fromPcRecord(rec), garchomp, FALLBACK);
    expect(f.speciesName).toBe('Garchomp');
    expect(f.level).toBe(78);
    expect(f.nature).toBe('Jolly');
    expect(f.item).toBe('Loaded Dice');
    expect(f.ivs.def).toBe(20);
    expect(f.evs.atk).toBe(252);
    // 3 own moves + 4th padded from fallback index 3
    expect(f.moves).toEqual(['Earthquake', 'Scale Shot', 'Swords Dance', 'Iron Head']);
  });

  it('truncates more than four moves', () => {
    const many = { ...rec, moves: ['A', 'B', 'C', 'D', 'E'] };
    const f = toCombatFields(fromPcRecord(many), garchomp, FALLBACK);
    expect(f.moves).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('fromTeamMember', () => {
  const member: TeamMemberPersist = {
    slot: 0,
    speciesId: 'garchomp',
    speciesDisplay: 'Garchomp',
    item: null,
    ability: null,
    nature: null,
    evs: null,
    moves: null,
  };

  it('all-null details fall back to sane defaults', () => {
    const f = toCombatFields(fromTeamMember(member), garchomp, FALLBACK);
    expect(f.level).toBe(50);
    expect(f.nature).toBe('Hardy');
    expect(f.ability).toBe('Rough Skin');
    expect(f.item).toBe('');
    expect(f.ivs).toEqual({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 });
    expect(f.evs).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(f.moves).toEqual(FALLBACK);
  });

  it('partial EVs merge over the zero fill', () => {
    const f = toCombatFields(
      fromTeamMember({ ...member, evs: { atk: 252 } }),
      garchomp,
      FALLBACK,
    );
    expect(f.evs.atk).toBe(252);
    expect(f.evs.hp).toBe(0);
  });
});

describe('toSessionSpec', () => {
  it('produces makePokemon-shaped data with named moves only', () => {
    const s = toSessionSpec(fromPcRecord(rec), garchomp, []);
    expect(s.moves).toEqual([
      { name: 'Earthquake' },
      { name: 'Scale Shot' },
      { name: 'Swords Dance' },
    ]);
    expect(s.item).toBe('Loaded Dice');
    expect(s.level).toBe(78);
  });
});
