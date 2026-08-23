/**
 * Single source of truth for Pokémon sprite URLs, with graceful fallback.
 *
 * We don't vendor sprite images (not ours to redistribute). Each chain tries
 * the Electron offline cache first (`cpsprite://`, served by
 * src/main/spriteCache.ts - a per-user cache that downloads from PokeAPI on
 * first view and then works offline), then the PokeAPI mirror directly (the
 * path used outside Electron, e.g. a browser dev tab). Chains are ordered
 * most-preferred first (e.g. artwork -> pixel) and end naturally; when exhausted
 * the consumer shows a glyph placeholder instead of a blank box - the bug that
 * left squad hexes empty when a sprite couldn't load.
 */
import { useEffect, useState } from 'react';
import FORM_SPRITES from './formSprites.json';

const REMOTE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
// Custom scheme handled by the main process; host segment is ignored there.
const CACHE = 'cpsprite://sprites';

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
  // Each entry resolves through the offline cache first, then the mirror; for a
  // given variant we prefer artwork, then fall back to the smaller pixel sprite.
  const sources = (sub: string) => [`${CACHE}/${sub}`, `${REMOTE}/${sub}`];
  const artwork = `other/official-artwork/${id}.png`;
  const pixel = `${id}.png`;
  switch (kind) {
    case 'artwork':
      return [...sources(artwork), ...sources(pixel)];
    case 'shiny':
      // A missing shiny drops back to the normal sprite for the species.
      return [...sources(`shiny/${id}.png`), ...sources(pixel)];
    case 'pixel':
    default:
      return sources(pixel);
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
