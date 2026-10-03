import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { viewForFormat, type DexFile, type DexSpecies } from './data';
import { FORMATS, FORMAT_ORDER } from './formats';
import type { SmogonBundle } from './smogon';

const species = (id: string, over: Partial<DexSpecies>): DexSpecies => ({
  id,
  name: id,
  dex: 1,
  types: ['normal'],
  abilities: [],
  hiddenAbilities: [],
  baseStats: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  eggGroups: [],
  height: 1,
  weight: 1,
  labels: [],
  formats: {},
  moves: [],
  ...over,
});

const move = (id: string, past = false) => ({
  id,
  name: id,
  type: 'normal',
  category: 'Physical' as const,
  power: 50,
  accuracy: 100 as const,
  pp: 10,
  priority: 0,
  desc: '',
  target: 'normal',
  flags: [],
  ...(past ? { past: true as const } : {}),
});

const fixture: DexFile = {
  formats: ['gen9ou', 'gen9nationaldex'],
  species: [
    species('both', {
      formats: { gen9ou: { tier: 'OU', banned: false }, gen9nationaldex: { tier: 'UU', banned: false } },
      moves: [
        { learn: 'tm', move: 'tackle' },
        { learn: 'legacy', move: 'oldmove' },
        { learn: 'legacy', move: 'hiddenpower' },
      ],
    }),
    species('natdexonly', { formats: { gen9nationaldex: { tier: 'RU', banned: false } } }),
    species('uber', {
      formats: { gen9ou: { tier: 'Uber', banned: true }, gen9nationaldex: { tier: 'Uber', banned: true } },
    }),
  ],
  moves: { tackle: move('tackle'), oldmove: move('oldmove'), hiddenpower: move('hiddenpower', true) },
  items: [
    { id: 'leftovers', name: 'Leftovers', category: 'held' },
    { id: 'charizarditex', name: 'Charizardite X', category: 'mega', past: true },
  ],
};

describe('viewForFormat', () => {
  it('keeps only the species in the format, with its tier and ban', () => {
    const ou = viewForFormat(fixture, FORMATS.gen9ou);
    expect(ou.pokemon.map((p) => p.id)).toEqual(['both', 'uber']);
    expect(ou.pokemonById.both.tier).toBe('OU');
    expect(ou.pokemonById.uber.banned).toBe(true);
    const natdex = viewForFormat(fixture, FORMATS.gen9nationaldex);
    expect(natdex.pokemon.map((p) => p.id)).toEqual(['both', 'natdexonly', 'uber']);
    expect(natdex.pokemonById.both.tier).toBe('UU');
  });

  it('drops legacy moves and past-gen moves and items outside National Dex', () => {
    const ou = viewForFormat(fixture, FORMATS.gen9ou);
    expect(ou.pokemonById.both.moves.map((m) => m.move)).toEqual(['tackle']);
    expect(Object.keys(ou.moves).sort()).toEqual(['oldmove', 'tackle']);
    expect(ou.items.map((i) => i.id)).toEqual(['leftovers']);

    const natdex = viewForFormat(fixture, FORMATS.gen9nationaldex);
    expect(natdex.pokemonById.both.moves.map((m) => m.move)).toEqual(['tackle', 'oldmove', 'hiddenpower']);
    expect(natdex.items.map((i) => i.id)).toEqual(['leftovers', 'charizarditex']);
  });

  it('does not leak the per-format fields into the species', () => {
    const p = viewForFormat(fixture, FORMATS.gen9ou).pokemonById.both;
    expect('formats' in p).toBe(false);
    expect('past' in viewForFormat(fixture, FORMATS.gen9nationaldex).moves.hiddenpower).toBe(false);
  });
});

describe('generated data', () => {
  const dataDir = resolve(__dirname, '../../public/data');
  const dex = JSON.parse(readFileSync(resolve(dataDir, 'dex.json'), 'utf8')) as DexFile;

  it('lists every supported format', () => {
    expect([...dex.formats].sort()).toEqual([...FORMAT_ORDER].sort());
  });

  it('matches known Showdown facts', () => {
    const ou = viewForFormat(dex, FORMATS.gen9ou).pokemonById;
    const natdex = viewForFormat(dex, FORMATS.gen9nationaldex).pokemonById;
    expect(ou.garchomp).toBeDefined();
    expect(ou.koraidon.banned).toBe(true);
    expect(ou.charizardmegax).toBeUndefined();
    expect(natdex.charizardmegax).toBeDefined();
    expect(ou.mrmime).toBeUndefined();
    expect(natdex.mrmime).toBeDefined();
    expect(ou.greattusk.labels).toContain('paradox');
  });

  it('gives Gen 9 OU no legacy moves', () => {
    const ou = viewForFormat(dex, FORMATS.gen9ou);
    expect(ou.pokemon.every((p) => p.moves.every((m) => m.learn !== 'legacy'))).toBe(true);
  });

  for (const id of FORMAT_ORDER) {
    it(`keys ${id} usage by species the format allows`, () => {
      const usage = JSON.parse(readFileSync(resolve(dataDir, 'usage', `${id}.json`), 'utf8')) as SmogonBundle;
      const view = viewForFormat(dex, FORMATS[id]).pokemonById;
      const missing = Object.keys(usage.species).filter((sid) => !view[sid]);
      expect(missing).toEqual([]);
      expect(usage.meta.format).toBe(id);
    });
  }
});
