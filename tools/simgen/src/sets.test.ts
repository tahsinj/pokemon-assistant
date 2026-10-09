import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../src/renderer/src/engine/bots/random';
import { buildSmogonSetPool } from '../../../src/renderer/src/lib/battle/predictor/smogonPriors';
import { viewForFormat, type DexFile } from '../../../src/renderer/src/lib/data';
import { FORMATS } from '../../../src/renderer/src/lib/formats';
import type { SmogonBundle } from '../../../src/renderer/src/lib/smogon';
import { playPair } from './play';
import { SetSampler } from './sets';
import { searchBot } from '../../../src/renderer/src/engine/bots/search';
import { FEATURE_NAMES } from '../../../src/renderer/src/ml/matchupFeatures';

const read = <T>(path: string) => JSON.parse(readFileSync(new URL(`../../../src/renderer/public/data/${path}`, import.meta.url), 'utf8')) as T;
const view = viewForFormat(read<DexFile>('dex.json'), FORMATS.gen9ou);
const usage = read<SmogonBundle>('usage/gen9ou.json');
const pool = buildSmogonSetPool(usage, view.pokemonById);
const sampler = new SetSampler(usage, pool, view.pokemonById);

describe('simgen', () => {
  it('samples legal-looking sets, and off-meta variants when asked', () => {
    const rand = seededRandom(1);
    const variants = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const { set, variant } = sampler.sample(rand, 0.5);
      variants.add(variant);
      expect(set.moves.length).toBeGreaterThan(0);
      expect(set.moves.length).toBeLessThanOrEqual(4);
      expect(view.pokemonById[set.species.toLowerCase().replace(/[^a-z0-9]/g, '')]?.banned).toBe(false);
    }
    expect([...variants].sort()).toEqual(['', 'item', 'move', 'spread']);
  });

  it('plays a pair and records the result with its features', () => {
    const rand = seededRandom(2);
    const r = playPair('gen9ou', sampler.sample(rand, 0), sampler.sample(rand, 0), [searchBot({}, pool), searchBot({}, pool)], 2, 5);
    expect(r.win).toBeGreaterThanOrEqual(0);
    expect(r.win).toBeLessThanOrEqual(1);
    expect(r.turns).toBeGreaterThan(0);
    expect(r.features).toHaveLength(FEATURE_NAMES.length);
  }, 60_000);
});
