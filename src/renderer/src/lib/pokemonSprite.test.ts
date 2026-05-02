import { describe, expect, it } from 'vitest';
import { dexForSpeciesName, pokemonSpriteUrl } from './pokemonSprite';

describe('pokemonSprite', () => {
  it('builds default and artwork URLs from national dex', () => {
    expect(pokemonSpriteUrl(25)).toContain('/sprites/pokemon/25.png');
    expect(pokemonSpriteUrl(25, 'artwork')).toContain('/official-artwork/25.png');
  });

  it('returns null for invalid dex', () => {
    expect(pokemonSpriteUrl(0)).toBeNull();
    expect(pokemonSpriteUrl(-1)).toBeNull();
  });

  it('resolves dex from species list', () => {
    const list = [{ id: 'pikachu', name: 'Pikachu', dex: 25 }];
    expect(dexForSpeciesName(list, 'Pikachu')).toBe(25);
    expect(dexForSpeciesName(list, 'pikachu')).toBe(25);
    expect(dexForSpeciesName(list, 'MissingNo')).toBeNull();
  });
});
