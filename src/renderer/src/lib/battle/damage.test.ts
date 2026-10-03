import { describe, expect, it } from 'vitest';
import { calcDamage } from './damage';
import { EMPTY_FIELD, NEUTRAL_EVS, NEUTRAL_IVS, type BattlePokemonSpec } from './types';

function mon(speciesName: string, extra: Partial<BattlePokemonSpec> = {}): BattlePokemonSpec {
  return {
    speciesName,
    level: 100,
    nature: 'Serious',
    ivs: { ...NEUTRAL_IVS },
    evs: { ...NEUTRAL_EVS },
    moves: [],
    ...extra,
  };
}

const garchomp = (item?: string) =>
  mon('Garchomp', { nature: 'Adamant', evs: { ...NEUTRAL_EVS, atk: 252 }, item });
const heatran = mon('Heatran', { evs: { ...NEUTRAL_EVS, hp: 252 } });

describe('calcDamage input names', () => {
  it('applies an item given in id form', () => {
    const named = calcDamage(9, garchomp('Choice Band'), heatran, 'Earthquake', EMPTY_FIELD);
    const id = calcDamage(9, garchomp('choiceband'), heatran, 'Earthquake', EMPTY_FIELD);
    const none = calcDamage(9, garchomp(), heatran, 'Earthquake', EMPTY_FIELD);
    expect(id.rolls).toEqual(named.rolls);
    expect(id.max).toBeGreaterThan(none.max);
  });

  it('applies an ability given in id form', () => {
    const rotom = mon('Rotom-Wash', { ability: 'levitate' });
    const out = calcDamage(9, garchomp(), rotom, 'Earthquake', EMPTY_FIELD);
    expect(out.isZero).toBe(true);
  });

  it('accepts a move given in id form', () => {
    const named = calcDamage(9, garchomp(), heatran, 'Earthquake', EMPTY_FIELD);
    const id = calcDamage(9, garchomp(), heatran, 'earthquake', EMPTY_FIELD);
    expect(id.rolls).toEqual(named.rolls);
  });

  it('lets an id-form Focus Sash survive a guaranteed OHKO from full HP', () => {
    const frail = (item?: string) => mon('Alakazam', { item });
    const plain = calcDamage(9, garchomp('Choice Band'), frail(), 'Earthquake', EMPTY_FIELD);
    expect(plain.ko.n).toBe(1);
    const sash = calcDamage(9, garchomp('Choice Band'), frail('focussash'), 'Earthquake', EMPTY_FIELD);
    expect(sash.ko.n).toBe(2);
    expect(sash.ko.text).toContain('Focus Sash');
  });

  it('passes unknown names through instead of dropping them', () => {
    const out = calcDamage(9, garchomp('Not A Real Item'), heatran, 'Earthquake', EMPTY_FIELD);
    expect(out.error).toBeUndefined();
    expect(out.rolls.length).toBeGreaterThan(0);
  });
});
