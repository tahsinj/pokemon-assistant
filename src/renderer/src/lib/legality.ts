/**
 * Format legality from a species' Smogon NatDex tier (`natDexTier`, patched in
 * by scripts/fetch-tiers.mjs). Lower tiers are always usable in higher ones, so
 * NatDex OU bans only the Uber / Anything-Goes mons.
 */

import type { Pokemon } from './types';

const NATDEX_OU_BANNED = new Set(['Uber', 'AG', 'Illegal', 'Unreleased']);

/** True if the species may be used on a NatDex OU team. Unknown tier -> allowed. */
export function isNatDexOULegal(p: Pokemon): boolean {
  if (!p.natDexTier) return true;
  return !NATDEX_OU_BANNED.has(p.natDexTier);
}

const NONSTANDARD_LABELS = new Set(['legendary', 'mythical', 'paradox', 'restricted', 'ultra_beast', 'ultrabeast']);

/**
 * Legendary / mythical / paradox / restricted / ultra-beast - the "not a normal
 * obtainable Pokémon" set we don't recommend as a teammate. Labels are accurate
 * when present but miss some paradox/box legendaries (Great Tusk, Koraidon,
 * Zacian), so the non-breedable "undiscovered" egg group backs it up. (Baby
 * pre-evos also sit there but carry the 'baby' label; Nidoqueen/Nidorina are
 * accepted false positives - fine to omit from suggestions.)
 */
export function isLegendaryOrParadox(p: Pokemon): boolean {
  const labels = (p.labels ?? []).map((l) => l.toLowerCase());
  if (labels.some((l) => NONSTANDARD_LABELS.has(l))) return true;
  return (p.eggGroups ?? []).includes('undiscovered') && !labels.includes('baby');
}

/** A "normal" NatDex OU teammate to suggest: OU-legal and not a legend/paradox. */
export function isSuggestableTeammate(p: Pokemon): boolean {
  return isNatDexOULegal(p) && !isLegendaryOrParadox(p);
}
