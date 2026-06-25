/**
 * Persist saved Counter Draft matchups (the opponent team you entered) to
 * localStorage so they can be re-analyzed later against a grown PC. We store
 * only the opponent input (species + level), not the result - Re-analyze re-runs
 * the draft against the current PC. Pure list ops are unit-tested; the
 * load/persist helpers no-op when localStorage is unavailable (node tests).
 */
export interface SavedOpponent {
  speciesId: string;
  level: number;
}

export interface SavedDraft {
  id: string;
  label: string;
  opponents: SavedOpponent[];
  createdAt: number;
}

const KEY = 'cobblemon-counter-drafts';

export function loadSavedDrafts(): SavedDraft[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedDraft[]) : [];
  } catch {
    return [];
  }
}

export function persistSavedDrafts(list: SavedDraft[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/** Prepend a new saved draft (newest first). Pure. */
export function addDraft(list: SavedDraft[], label: string, opponents: SavedOpponent[]): SavedDraft[] {
  const draft: SavedDraft = {
    id: `cd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    opponents,
    createdAt: Date.now(),
  };
  return [draft, ...list];
}

/** Remove a saved draft by id. Pure. */
export function removeDraft(list: SavedDraft[], id: string): SavedDraft[] {
  return list.filter((d) => d.id !== id);
}
