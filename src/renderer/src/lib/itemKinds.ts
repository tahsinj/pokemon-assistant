/**
 * Classify held items into "gated" mechanics that the team-builder shouldn't
 * recommend unless the player owns them - Mega Stones and Z-Crystals - versus
 * normal/craftable items it can suggest freely.
 *
 * Mega Stones are reliably the `category: 'mega'` items; Z-Crystals are named
 * "… Z" / "…ium Z" and scattered across several data categories, so they're
 * matched by name. (Tera is a set property, not a held item, so it isn't gated
 * here.)
 */
import type { HeldItem } from './types';

export const normItemId = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Z-Crystals are the only items whose display name ends in a standalone " Z". */
export function isZCrystalName(name: string): boolean {
  return / Z$/.test(name.trim());
}

/** Normalized ids of items gated behind ownership (Mega Stones + Z-Crystals). */
export function buildGatedItemIds(items: HeldItem[]): Set<string> {
  const out = new Set<string>();
  for (const it of items) {
    if (it.category === 'mega' || isZCrystalName(it.name)) out.add(normItemId(it.name));
  }
  return out;
}

/** The gated items, split for a "what do you own" UI. */
export function gatedItemsByKind(items: HeldItem[]): { mega: HeldItem[]; zcrystal: HeldItem[] } {
  const mega: HeldItem[] = [];
  const zcrystal: HeldItem[] = [];
  for (const it of items) {
    if (isZCrystalName(it.name)) zcrystal.push(it);
    else if (it.category === 'mega') mega.push(it);
  }
  const byName = (a: HeldItem, b: HeldItem) => a.name.localeCompare(b.name);
  return { mega: mega.sort(byName), zcrystal: zcrystal.sort(byName) };
}

/**
 * Build the `allowItem(name)` predicate the Best-6 advice uses: a gated item is
 * only allowed when the player owns it; everything else (craftable / normal) is
 * always allowed.
 */
export function makeItemFilter(gated: Set<string>, owned: Set<string>): (name: string) => boolean {
  return (name: string) => {
    const id = normItemId(name);
    return !gated.has(id) || owned.has(id);
  };
}
