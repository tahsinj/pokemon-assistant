import { describe, expect, it } from 'vitest';
import { toSpeciesId } from './speciesId';

describe('toSpeciesId', () => {
  it('turns old saved ids and display names into Showdown ids', () => {
    expect(toSpeciesId('great tusk')).toBe('greattusk');
    expect(toSpeciesId('mr. mime')).toBe('mrmime');
    expect(toSpeciesId('nidoran-f')).toBe('nidoranf');
    expect(toSpeciesId('Type: Null')).toBe('typenull');
    expect(toSpeciesId('Landorus-Therian')).toBe('landorustherian');
  });

  it('strips accents and curly apostrophes', () => {
    expect(toSpeciesId('flabébé')).toBe('flabebe');
    expect(toSpeciesId('farfetch’d')).toBe('farfetchd');
  });

  it('maps forms with no standalone Showdown entry', () => {
    expect(toSpeciesId('greninjaash')).toBe('greninjabond');
    expect(toSpeciesId('Eternatus-Eternamax')).toBe('eternatus');
  });

  it('leaves Showdown ids alone', () => {
    expect(toSpeciesId('garchomp')).toBe('garchomp');
  });
});
