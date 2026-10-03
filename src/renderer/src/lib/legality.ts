/**
 * Format legality and the "not an ordinary Pokémon" filter. Each species in a
 * format view already carries `banned` from Showdown's own rules (see
 * scripts/build-dex.mjs), so legality is that flag.
 */

import type { Pokemon } from './types';

/** True if the active format allows the species. */
export function isFormatLegal(p: Pokemon): boolean {
  return !p.banned;
}

const SPECIAL_LABELS = new Set(['legendary', 'mythical', 'paradox', 'restricted', 'ultra_beast']);

/** Legendary, mythical, paradox or Ultra Beast: species we don't suggest as teammates. */
export function isLegendaryOrParadox(p: Pokemon): boolean {
  return (p.labels ?? []).some((l) => SPECIAL_LABELS.has(l));
}

/** A teammate worth suggesting: legal in the format and not a legend or paradox. */
export function isSuggestableTeammate(p: Pokemon): boolean {
  return isFormatLegal(p) && !isLegendaryOrParadox(p);
}
