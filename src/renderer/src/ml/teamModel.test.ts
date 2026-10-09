import { describe, expect, it } from 'vitest';
import { encodeTeam, monTokens } from './teamModel';

describe('team model tokens', () => {
  // ml/tests/test_team_features.py checks the same cases on the Python side.
  it('match the training tokens', () => {
    expect(monTokens({ species: 'Great Tusk', item: 'Booster Energy', ability: 'Protosynthesis', tera: 'Steel', moves: ['Rapid Spin', 'Headlong Rush', 'Ice Spinner', 'Knock Off', 'Bulk Up'] })).toEqual([
      's:greattusk', 'i:boosterenergy', 'a:protosynthesis', 't:steel', 'm:rapidspin', 'm:headlongrush', 'm:icespinner', 'm:knockoff',
    ]);
    expect(monTokens({ species: 'Rotom-Wash' })).toEqual(['s:rotomwash']);
  });

  it('encode teams as vocabulary indices, falling back to the base species', () => {
    const vocab = { slots: 8, tokens: { '<pad>': 0, '<unk>': 1, 's:urshifu': 2, 'i:choiceband': 3, 's:garchomp': 4 } };
    const out = encodeTeam([{ species: 'urshifurapidstrike', base: 'Urshifu', item: 'Choice Band', moves: ['surgingstrikes'] }, { species: 'missingno' }], vocab);
    expect(out).toHaveLength(48);
    expect(out.slice(0, 8)).toEqual([2, 3, 0, 0, 0, 0, 0, 0]);
    expect(out.slice(8, 16)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(out.slice(16)).toEqual(new Array(32).fill(0));
  });
});
