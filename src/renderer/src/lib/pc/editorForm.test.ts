import { describe, expect, it } from 'vitest';
import { numericFormFromSpread, parseNumericForm } from './editorForm';
import { DEFAULT_IVS, ZERO_EVS } from './defaults';

describe('parseNumericForm', () => {
  it('allows empty fields while editing then applies defaults on commit', () => {
    const form = numericFormFromSpread(50, DEFAULT_IVS, ZERO_EVS);
    form.level = '';
    form.ivs.hp = '';
    form.evs.atk = '';
    const r = parseNumericForm(form);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.level).toBe(50);
      expect(r.ivs.hp).toBe(31);
      expect(r.evs.atk).toBe(0);
    }
  });

  it('rejects invalid level on save', () => {
    const form = numericFormFromSpread(50, DEFAULT_IVS, ZERO_EVS);
    form.level = 'abc';
    const r = parseNumericForm(form);
    expect(r.ok).toBe(false);
  });

  it('parses level 100', () => {
    const form = numericFormFromSpread(50, DEFAULT_IVS, ZERO_EVS);
    form.level = '100';
    const r = parseNumericForm(form);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.level).toBe(100);
  });
});
