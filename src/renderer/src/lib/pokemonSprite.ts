/** Remote sprite URLs (PokéAPI GitHub mirror). No local assets required. */

const SPRITE_BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

export type PokemonSpriteVariant = 'default' | 'artwork' | 'shiny';

export function pokemonSpriteUrl(dex: number, variant: PokemonSpriteVariant = 'default'): string | null {
  if (!Number.isFinite(dex) || dex < 1) return null;
  const id = Math.floor(dex);
  if (variant === 'artwork') {
    return `${SPRITE_BASE}/other/official-artwork/${id}.png`;
  }
  if (variant === 'shiny') {
    return `${SPRITE_BASE}/shiny/${id}.png`;
  }
  return `${SPRITE_BASE}/${id}.png`;
}

export function dexForSpeciesName(pokemon: { id: string; name: string; dex: number }[], name: string): number | null {
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const hit =
    pokemon.find((p) => p.name.toLowerCase() === q) ??
    pokemon.find((p) => p.id.toLowerCase() === q.replace(/\s+/g, '-'));
  return hit && hit.dex > 0 ? hit.dex : null;
}
