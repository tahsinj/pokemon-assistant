import { describe, expect, it } from 'vitest';
import { biomeLabel, listBiomes, speciesInBiome } from './spawnQuery';
import type { SpawnEntry } from './types';

const entry = (over: Partial<SpawnEntry>): SpawnEntry => ({
  biomes: [],
  presets: [],
  ...over,
});

const spawns: Record<string, SpawnEntry[]> = {
  dragonite: [
    entry({ bucket: 'ultra-rare', biomes: ['#cobblemon:is_ocean'], weight: 1 }),
  ],
  magikarp: [
    entry({ bucket: 'common', biomes: ['#cobblemon:is_ocean', '#cobblemon:is_river'], weight: 8 }),
    entry({ bucket: 'common', biomes: ['#cobblemon:is_river'], weight: 8 }),
  ],
  zubat: [entry({ bucket: 'common', biomes: ['#cobblemon:is_cave'] })],
};

describe('biomeLabel', () => {
  it('strips the cobblemon tag prefix and is_ prefix', () => {
    expect(biomeLabel('#cobblemon:is_ocean')).toBe('ocean');
    expect(biomeLabel('minecraft:plains')).toBe('minecraft:plains');
  });
});

describe('listBiomes', () => {
  it('returns sorted unique biome tags across all species', () => {
    expect(listBiomes(spawns)).toEqual([
      '#cobblemon:is_cave',
      '#cobblemon:is_ocean',
      '#cobblemon:is_river',
    ]);
  });
});

describe('speciesInBiome', () => {
  it('finds every species with an entry in the biome', () => {
    const hits = speciesInBiome(spawns, '#cobblemon:is_ocean');
    expect(hits.map((h) => h.speciesId).sort()).toEqual(['dragonite', 'magikarp']);
  });

  it('filters by rarity bucket', () => {
    const hits = speciesInBiome(spawns, '#cobblemon:is_ocean', { bucket: 'ultra-rare' });
    expect(hits).toHaveLength(1);
    expect(hits[0].speciesId).toBe('dragonite');
  });

  it('deduplicates species but keeps all matching entries', () => {
    const hits = speciesInBiome(spawns, '#cobblemon:is_river');
    expect(hits).toHaveLength(1);
    expect(hits[0].speciesId).toBe('magikarp');
    expect(hits[0].entries).toHaveLength(2);
  });

  it('applies the other spawn filters to entries', () => {
    const stormy: Record<string, SpawnEntry[]> = {
      thundurus: [entry({ bucket: 'ultra-rare', biomes: ['#cobblemon:is_plains'], isThundering: true })],
      pidgey: [entry({ bucket: 'common', biomes: ['#cobblemon:is_plains'] })],
    };
    const hits = speciesInBiome(stormy, '#cobblemon:is_plains', { weather: 'storm' });
    expect(hits.map((h) => h.speciesId)).toEqual(['thundurus']);
  });
});
