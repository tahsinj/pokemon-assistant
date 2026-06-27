import { describe, expect, it } from 'vitest';
import { parseShowdownTeam } from '../showdownTeam';
import { importPcFromShowdown } from './import';
import type { Pokemon } from '../types';
import { buildSpeciesFuse } from '../fuzzySpecies';

const pikachu: Pokemon = {
  id: 'pikachu',
  name: 'Pikachu',
  dex: 25,
  types: ['electric'],
  baseStats: { hp: 35, atk: 55, def: 40, spa: 50, spd: 50, spe: 90 },
  abilities: ['Static'],
  hiddenAbilities: [],
  eggGroups: ['field', 'fairy'],
  height: 4,
  weight: 60,
  labels: [],
  moves: [],
};

describe('parseShowdownTeam for PC', () => {
  it('skips box header blocks', () => {
    const paste = `=== Box 01 ===

Pikachu
Ability: Static
- Thunderbolt`;
    const mons = parseShowdownTeam(paste, { maxMons: 30 });
    expect(mons).toHaveLength(1);
    expect(mons[0].species).toBe('Pikachu');
  });

  it('allows more than 6 Pokémon when maxMons is 30', () => {
    const blocks = Array.from({ length: 8 }, (_, i) => `Species${i}\n- Tackle`).join('\n\n');
    const mons = parseShowdownTeam(blocks, { maxMons: 30 });
    expect(mons).toHaveLength(8);
  });
});

describe('importPcFromShowdown', () => {
  it('replace mode clears box and fills from slot 0', async () => {
    const fuse = buildSpeciesFuse([pikachu]);
    const deleted: string[] = [];
    const saved: number[] = [];

    const result = await importPcFromShowdown({
      paste: 'Pikachu\nAbility: Static\n- Thunderbolt',
      boxId: 'box-1',
      mode: 'replace',
      speciesFuse: fuse,
      occupants: [
        {
          id: 'old-1',
          boxId: 'box-1',
          slot: 3,
          speciesId: 'eevee',
          speciesDisplay: 'Eevee',
          nickname: null,
          level: 5,
          gender: 'genderless',
          nature: 'Hardy',
          ability: 'Run Away',
          item: null,
          ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
          evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
          moves: ['Tackle', '', '', ''],
          notes: null,
          shiny: false,
          updatedAt: 0,
        },
      ],
      save: async (p) => {
        saved.push(p.slot);
        return { id: 'new' };
      },
      deleteMon: async (id) => {
        deleted.push(id);
      },
    });

    expect(deleted).toEqual(['old-1']);
    expect(saved).toEqual([0]);
    expect(result.placed).toBe(1);
  });
});
