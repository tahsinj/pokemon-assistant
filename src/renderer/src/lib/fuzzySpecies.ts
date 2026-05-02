import Fuse from 'fuse.js';
import type { Pokemon } from './types';

export function buildSpeciesFuse(pokemon: Pokemon[]) {
  return new Fuse(pokemon, {
    keys: [
      { name: 'name', weight: 0.65 },
      { name: 'id', weight: 0.35 },
    ],
    threshold: 0.42,
    ignoreLocation: true,
  });
}

/** Resolve a pasted Showdown species name to a dex entry (typo-tolerant). */
export function resolveSpeciesName(fuse: ReturnType<typeof buildSpeciesFuse>, raw: string): Pokemon | null {
  const q = raw.trim();
  if (!q) return null;
  const hits = fuse.search(q, { limit: 1 });
  if (hits.length) return hits[0].item;
  return null;
}
