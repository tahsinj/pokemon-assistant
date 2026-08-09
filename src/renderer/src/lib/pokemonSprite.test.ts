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

  it('uses the form-specific sprite id when the name maps to one', () => {
    // Rotom appliances all share dex #479; the name disambiguates the sprite.
    expect(pokemonSpriteUrl(479, 'default', 'Rotom-Heat')).toContain('/sprites/pokemon/10008.png');
    expect(pokemonSpriteUrl(479, 'default', 'Rotom-Wash')).toContain('/sprites/pokemon/10009.png');
    // Base species and unmapped names fall back to the dex sprite.
    expect(pokemonSpriteUrl(479, 'default', 'Rotom')).toContain('/sprites/pokemon/479.png');
  });

  it('resolves a form id even when dex is unusable', () => {
    expect(pokemonSpriteUrl(0, 'default', 'Rotom-Heat')).toContain('/sprites/pokemon/10008.png');
  });

  it('resolves dex from species list', () => {
    const list = [{ id: 'pikachu', name: 'Pikachu', dex: 25 }];
    expect(dexForSpeciesName(list, 'Pikachu')).toBe(25);
    expect(dexForSpeciesName(list, 'pikachu')).toBe(25);
    expect(dexForSpeciesName(list, 'MissingNo')).toBeNull();
  });
});
