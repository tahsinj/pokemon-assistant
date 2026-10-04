import { describe, expect, it } from 'vitest';
import { abilityName, speciesParts } from './displayNames';

describe('abilityName', () => {
  it('turns ids into display names', () => {
    expect(abilityName('overgrow')).toBe('Overgrow');
    expect(abilityName('roughskin')).toBe('Rough Skin');
    expect(abilityName('Rough Skin')).toBe('Rough Skin');
  });
});

describe('speciesParts', () => {
  it('splits alternate forms into base name and form label', () => {
    expect(speciesParts({ name: 'Venusaur-Mega', baseSpecies: 'Venusaur', forme: 'Mega' })).toEqual({ base: 'Venusaur', form: 'Mega' });
    expect(speciesParts({ name: 'Urshifu-Rapid-Strike', baseSpecies: 'Urshifu', forme: 'Rapid-Strike' })).toEqual({
      base: 'Urshifu',
      form: 'Rapid Strike',
    });
  });

  it('leaves hyphenated base names alone', () => {
    expect(speciesParts({ name: 'Ho-Oh' })).toEqual({ base: 'Ho-Oh', form: null });
    expect(speciesParts({ name: 'Chi-Yu' })).toEqual({ base: 'Chi-Yu', form: null });
  });
});
