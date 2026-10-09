import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { viewForFormat, type DexFile } from './data';
import { FORMATS } from './formats';
import { quickEstimate, raidUpgrades, RAID_PRESETS } from './raid';
import type { BattlePokemonSpec } from './battle/types';
import { packSpecs, playRaid } from '../engine/verify';

const view = viewForFormat(JSON.parse(readFileSync(new URL('../../public/data/dex.json', import.meta.url), 'utf8')) as DexFile, FORMATS.gen9ou);
const species = (id: string) => view.pokemonById[id];

const spec = (speciesName: string, moves: string[], extra: Partial<BattlePokemonSpec> = {}): BattlePokemonSpec => ({
  speciesName,
  level: 100,
  nature: 'Adamant',
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
  moves: moves.map((name) => ({ name })),
  ...extra,
});

const garchomp = spec('Garchomp', ['Earthquake', 'Dragon Claw'], { ability: 'Rough Skin', item: 'Leftovers' });
const heatran = spec('Heatran', ['Magma Storm', 'Earth Power'], { nature: 'Modest', ability: 'Flash Fire', evs: { hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 } });

describe('raid quick estimate', () => {
  it('a Garchomp solos a Normal Heatran but needs help against a Brutal one', () => {
    const normal = quickEstimate(garchomp, species('garchomp').baseStats, heatran, species('heatran').baseStats, RAID_PRESETS.normal);
    const brutal = quickEstimate(garchomp, species('garchomp').baseStats, heatran, species('heatran').baseStats, RAID_PRESETS.brutal);
    expect(normal.moveName).toBe('Earthquake');
    expect(normal.faster).toBe(true);
    expect(normal.solo).toBe(true);
    expect(normal.estimator).toBeLessThan(1);
    expect(brutal.estimator).toBeGreaterThan(normal.estimator);
    expect(brutal.taken).toBeGreaterThan(normal.taken);
  });

  it('suggests teaching a stronger move and a better item', () => {
    const weak = spec('Garchomp', ['Dragon Claw', 'Rock Slide'], { ability: 'Rough Skin', item: 'Leftovers' });
    const { bestMoves, tips } = raidUpgrades(weak, species('garchomp'), view.moves, heatran, species('heatran').baseStats, RAID_PRESETS.tough);
    expect(bestMoves[0]).toMatch(/Earthquake|Precipice Blades|Headlong Rush/);
    expect(tips.some((t) => t.startsWith('Teach '))).toBe(true);
    expect(tips.some((t) => t.startsWith('Hold '))).toBe(true);
  });
});

describe('raid simulation', () => {
  it('plays a raid with the HP multiplier applied', () => {
    // Blissey with only Splash: it can't hurt, so only its HP decides the length.
    const boss = packSpecs([spec('Blissey', ['Splash'], { nature: 'Bold', ability: 'Natural Cure', evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 } })]);
    const member = packSpecs([garchomp]);
    const easy = playRaid(member, boss, { ...RAID_PRESETS.normal, hpMultiplier: 1, statBoosts: {} }, 1);
    const tanky = playRaid(member, boss, { ...RAID_PRESETS.normal, hpMultiplier: 4, statBoosts: {}, turnLimit: 40 }, 1);
    expect(easy.score).toBe(1);
    expect(tanky.turns).toBeGreaterThan(easy.turns);
  }, 60_000);
});
