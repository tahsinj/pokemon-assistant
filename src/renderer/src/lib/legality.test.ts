import { describe, expect, it } from 'vitest';
import { isNatDexOULegal } from './legality';
import type { Pokemon } from './types';

const mon = (natDexTier?: string): Pokemon => ({ natDexTier } as Pokemon);

describe('isNatDexOULegal', () => {
  it('allows OU and lower tiers', () => {
    for (const t of ['OU', 'UU', 'RU', 'NU', 'PU', 'ZU', 'NFE', 'LC', 'UUBL']) {
      expect(isNatDexOULegal(mon(t))).toBe(true);
    }
  });

  it('bans Uber and AG', () => {
    expect(isNatDexOULegal(mon('Uber'))).toBe(false);
    expect(isNatDexOULegal(mon('AG'))).toBe(false);
  });

  it('treats unknown tier as allowed', () => {
    expect(isNatDexOULegal(mon(undefined))).toBe(true);
  });
});
