import { describe, expect, it } from 'vitest';
import type { DamageOutcome } from './damage';
import { byThreat, koText, rangeText } from './koText';

const outcome = (over: Partial<DamageOutcome>): DamageOutcome => ({
  moveName: 'Tackle',
  category: 'Physical',
  basePower: 40,
  rolls: [10],
  min: 10,
  max: 12,
  avgDamage: 11,
  pctMin: 10,
  pctMax: 12,
  ko: { chance: 0, n: 0, text: '' },
  desc: '',
  isZero: false,
  ...over,
});

describe('koText', () => {
  it('labels guaranteed and possible KOs', () => {
    expect(koText(outcome({ ko: { chance: 1, n: 1, text: '' } })).text).toBe('1HKO');
    expect(koText(outcome({ ko: { chance: 0.375, n: 1, text: '' } })).text).toBe('38% 1HKO');
    expect(koText(outcome({ ko: { chance: 1, n: 2, text: '' } })).text).toBe('2HKO');
    expect(koText(outcome({ ko: { chance: 1, n: 4, text: '' } })).text).toBe('4HKO');
  });

  it('labels moves that do nothing', () => {
    expect(koText(outcome({ isZero: true })).text).toBe('IMMUNE');
    expect(koText(outcome({ category: 'Status', isZero: true })).text).toBe('N/A');
    expect(rangeText(outcome({ isZero: true }))).toBe('immune');
    expect(rangeText(outcome({ category: 'Status', isZero: true }))).toBe('-');
  });
});

describe('byThreat', () => {
  it('puts surer and faster KOs first, then damage, and no-damage moves last', () => {
    const ohko = outcome({ moveName: 'a', pctMax: 110, ko: { chance: 1, n: 1, text: '' } });
    const maybe = outcome({ moveName: 'b', pctMax: 95, ko: { chance: 0.2, n: 1, text: '' } });
    const twoHit = outcome({ moveName: 'c', pctMax: 60, ko: { chance: 1, n: 2, text: '' } });
    const chip = outcome({ moveName: 'd', pctMax: 20, ko: { chance: 0, n: 0, text: '' } });
    const status = outcome({ moveName: 'e', category: 'Status', isZero: true });
    const sorted = [status, chip, twoHit, maybe, ohko].sort(byThreat).map((d) => d.moveName);
    expect(sorted).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
