import { describe, expect, it } from 'vitest';
import { formatEvYield } from './stats';

describe('formatEvYield', () => {
  it('lists non-zero yields in stat order', () => {
    expect(formatEvYield({ hp: 0, atk: 0, def: 0, spa: 1, spd: 0, spe: 0 })).toEqual([
      { label: 'SpA', value: 1 },
    ]);
    expect(formatEvYield({ atk: 3 })).toEqual([{ label: 'Atk', value: 3 }]);
    expect(formatEvYield({ spe: 2, def: 1 })).toEqual([
      { label: 'Def', value: 1 },
      { label: 'Spe', value: 2 },
    ]);
  });

  it('skips zero yields', () => {
    expect(formatEvYield({ hp: 0 })).toEqual([]);
  });

  it('returns empty for missing yield', () => {
    expect(formatEvYield(undefined)).toEqual([]);
  });
});
