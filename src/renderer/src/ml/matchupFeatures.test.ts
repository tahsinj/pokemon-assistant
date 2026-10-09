import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES, featureVector, matchupFeatures } from './matchupFeatures';
import type { BattlePokemonSpec } from '../lib/battle/types';

const spec = (speciesName: string, moves: string[], extra: Partial<BattlePokemonSpec> = {}): BattlePokemonSpec => ({
  speciesName,
  level: 100,
  nature: 'Jolly',
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
  moves: moves.map((name) => ({ name })),
  ...extra,
});

const chomp = spec('Garchomp', ['Earthquake', 'Swords Dance', 'Stone Edge', 'Fire Fang'], { item: 'Choice Scarf', ability: 'Rough Skin' });
const tran = spec('Heatran', ['Magma Storm', 'Earth Power', 'Taunt', 'Stealth Rock'], { nature: 'Calm', ability: 'Flash Fire', item: 'Leftovers' });

describe('matchup features', () => {
  it('fills every named feature with a number, in order', () => {
    const v = featureVector(matchupFeatures(chomp, tran));
    expect(v).toHaveLength(FEATURE_NAMES.length);
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('reads the matchup the way a player would', () => {
    const f = matchupFeatures(chomp, tran);
    // Scarf Garchomp outspeeds and Earthquake is super effective on Heatran.
    expect(f.a_faster).toBe(1);
    expect(f.a_choice).toBe(1);
    expect(f.b_leftovers).toBe(1);
    expect(f.a_dmg_mean).toBeGreaterThan(f.b_dmg_mean);
    expect(f.a_setup).toBe(1);
  });

  it('mirrors when the sides swap', () => {
    const ab = matchupFeatures(chomp, tran);
    const ba = matchupFeatures(tran, chomp);
    expect(ba.b_dmg_mean).toBeCloseTo(ab.a_dmg_mean, 6);
    expect(ba.a_spe).toBe(ab.b_spe);
    expect(ba.hits_diff).toBe(-ab.hits_diff);
  });
});
