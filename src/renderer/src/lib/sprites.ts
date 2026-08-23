/**
 * Single source of truth for Pokémon sprite URLs, with graceful fallback.
 *
 * Sprites stream from the PokeAPI GitHub mirror (we don't vendor the images -
 * they're not ours to redistribute). Each chain is ordered most-preferred first
 * (e.g. official artwork -> pixel sprite) and ends naturally; when it's exhausted
 * the consumer shows a glyph/placeholder instead of a blank box (the bug that
 * left squad hexes empty when a sprite couldn't load). Offline, the whole chain
 * fails and the placeholder shows - never a blank.
 */
import { useEffect, useState } from 'react';
import FORM_SPRITES from './formSprites.json';

const REMOTE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

const formSprites: Record<string, number> = FORM_SPRITES;

// Keep in sync with normName() in scripts/fetch-form-sprites.mjs - both must
// normalize names identically or a form's sprite id won't line up.
export function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\./g, '')
    .replace(/:/g, '')
    .replace(/é/g, 'e')
    .replace(/%/g, '')
    .replace(/\s+/g, '-');
}

export type SpriteKind = 'pixel' | 'artwork' | 'shiny';

/**
 * Resolve the numeric PokeAPI sprite id for a species. Alternate forms share
 * their base dex (all six Rotom are #0479) but get their own sprite id via
 * formSprites.json; falls back to the dex number for base/cosmetic forms.
 */
export function spriteId(dex: number, name?: string): number | null {
  const formId = name ? formSprites[normName(name)] : undefined;
  if (formId == null && (!Number.isFinite(dex) || dex < 1)) return null;
  return formId ?? Math.floor(dex);
}

/** Ordered URLs to try, most-preferred first. Empty array => no sprite. */
export function spriteChain(dex: number, kind: SpriteKind = 'pixel', name?: string): string[] {
  const id = spriteId(dex, name);
  if (id == null) return [];
  switch (kind) {
    case 'artwork':
      // Big "holo" artwork, falling back to the smaller pixel sprite.
      return [`${REMOTE}/other/official-artwork/${id}.png`, `${REMOTE}/${id}.png`];
    case 'shiny':
      // A missing shiny drops back to the normal sprite for the species.
      return [`${REMOTE}/shiny/${id}.png`, `${REMOTE}/${id}.png`];
    case 'pixel':
    default:
      return [`${REMOTE}/${id}.png`];
  }
}

/**
 * Drive an `<img>` through a sprite fallback chain. Render `src` while
 * `!exhausted`, wire `onError` to advance to the next URL, and show a
 * glyph/placeholder once `exhausted` is true.
 */
export function useSpriteFallback(chain: string[]): {
  src: string | undefined;
  exhausted: boolean;
  onError: () => void;
} {
  const key = chain.join('|');
  const [i, setI] = useState(0);
  // Reset when the underlying chain changes (new species/variant).
  useEffect(() => setI(0), [key]);
  const exhausted = i >= chain.length;
  return { src: exhausted ? undefined : chain[i], exhausted, onError: () => setI((n) => n + 1) };
}
