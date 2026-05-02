import Fuse from 'fuse.js';
import type { HeldItem } from './types';

export function buildItemFuse(items: HeldItem[]) {
  return new Fuse(items, {
    keys: [
      { name: 'name', weight: 0.85 },
      { name: 'id', weight: 0.15 },
    ],
    threshold: 0.35,
    ignoreLocation: true,
  });
}

export function searchItems(fuse: ReturnType<typeof buildItemFuse>, query: string, limit = 12): HeldItem[] {
  const q = query.trim();
  if (!q) return [];
  return fuse.search(q, { limit }).map((r) => r.item);
}
