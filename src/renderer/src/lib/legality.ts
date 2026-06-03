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
