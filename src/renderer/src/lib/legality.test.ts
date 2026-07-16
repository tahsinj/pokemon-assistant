import { describe, expect, it } from 'vitest';
import { isNatDexOULegal, isLegendaryOrParadox, isSuggestableTeammate } from './legality';
import type { Pokemon } from './types';

const mon = (natDexTier?: string): Pokemon => ({ natDexTier } as Pokemon);
const spec = (over: Partial<Pokemon>): Pokemon =>
  ({ natDexTier: 'OU', labels: [], eggGroups: ['field'], ...over } as Pokemon);

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

describe('isLegendaryOrParadox', () => {
  it('flags labelled legendaries / mythicals', () => {
    expect(isLegendaryOrParadox(spec({ labels: ['gen1', 'legendary'], eggGroups: ['undiscovered'] }))).toBe(true);
    expect(isLegendaryOrParadox(spec({ labels: ['mythical'] }))).toBe(true);
  });

  it('flags unlabelled paradox / box legendaries via the undiscovered egg group', () => {
    // Great Tusk / Koraidon carry only a gen label but sit in "undiscovered".
    expect(isLegendaryOrParadox(spec({ labels: ['gen9'], eggGroups: ['undiscovered'] }))).toBe(true);
  });

  it('does not flag normal competitive mons', () => {
    expect(isLegendaryOrParadox(spec({ labels: ['gen4'], eggGroups: ['monster', 'dragon'] }))).toBe(false);
  });

  it('does not flag babies sitting in the undiscovered group', () => {
    expect(isLegendaryOrParadox(spec({ labels: ['baby'], eggGroups: ['undiscovered'] }))).toBe(false);
  });
});

describe('isSuggestableTeammate', () => {
  it('requires OU-legal AND not a legend/paradox', () => {
    expect(isSuggestableTeammate(spec({ eggGroups: ['field'] }))).toBe(true);
    expect(isSuggestableTeammate(spec({ natDexTier: 'Uber' }))).toBe(false);
    expect(isSuggestableTeammate(spec({ labels: ['paradox'], eggGroups: ['undiscovered'] }))).toBe(false);
  });
});
