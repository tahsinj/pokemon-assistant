import { describe, expect, it } from 'vitest';
import { isFormatLegal, isLegendaryOrParadox, isSuggestableTeammate } from './legality';
import type { Pokemon } from './types';

const spec = (over: Partial<Pokemon>): Pokemon => ({ banned: false, labels: [], ...over }) as Pokemon;

describe('isFormatLegal', () => {
  it('follows the banned flag from the format data', () => {
    expect(isFormatLegal(spec({ tier: 'OU' }))).toBe(true);
    expect(isFormatLegal(spec({ tier: 'Uber', banned: true }))).toBe(false);
  });

  it('treats a species without the flag as allowed', () => {
    expect(isFormatLegal({ labels: [] } as unknown as Pokemon)).toBe(true);
  });
});

describe('isLegendaryOrParadox', () => {
  it('flags legendary, mythical, paradox, restricted and Ultra Beast tags', () => {
    for (const label of ['legendary', 'mythical', 'paradox', 'restricted', 'ultra_beast']) {
      expect(isLegendaryOrParadox(spec({ labels: [label] }))).toBe(true);
    }
  });

  it('does not flag ordinary species', () => {
    expect(isLegendaryOrParadox(spec({ labels: [] }))).toBe(false);
  });
});

describe('isSuggestableTeammate', () => {
  it('requires a legal, ordinary species', () => {
    expect(isSuggestableTeammate(spec({}))).toBe(true);
    expect(isSuggestableTeammate(spec({ banned: true }))).toBe(false);
    expect(isSuggestableTeammate(spec({ labels: ['paradox'] }))).toBe(false);
  });
});
