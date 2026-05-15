import { describe, expect, it } from 'vitest';
import { formatEvYield } from './stats';

describe('formatEvYield', () => {
  it('maps Cobblemon snake_case keys to stat labels', () => {
    expect(
      formatEvYield({ hp: 0, attack: 0, defence: 0, special_attack: 1, special_defence: 0, speed: 0 }),
    ).toEqual([{ label: 'SpA', value: 1 }]);
    expect(formatEvYield({ attack: 3 })).toEqual([{ label: 'Atk', value: 3 }]);
    expect(formatEvYield({ defence: 1, speed: 2 })).toEqual([
      { label: 'Def', value: 1 },
      { label: 'Spe', value: 2 },
    ]);
  });

  it('skips zero yields and unknown keys', () => {
    expect(formatEvYield({ hp: 0, mystery_stat: 2 })).toEqual([]);
  });

  it('returns empty for missing yield', () => {
    expect(formatEvYield(undefined)).toEqual([]);
  });
});
