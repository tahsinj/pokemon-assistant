/**
 * Renderer-local record of which gated items (Mega Stones / Z-Crystals) the
 * player owns, so the team-builder can recommend them. Stored in localStorage
 * as normalized item ids - see `itemKinds.ts` for what counts as gated.
 */
import { readStorage } from './storage';

const KEY = 'stablab:owned-items';

export function loadOwnedItems(): Set<string> {
  try {
    const raw = readStorage(KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

export function saveOwnedItems(owned: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...owned]));
  } catch {
    /* ignore */
  }
}

export function toggleOwnedItem(owned: Set<string>, id: string): Set<string> {
  const next = new Set(owned);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  saveOwnedItems(next);
  return next;
}
