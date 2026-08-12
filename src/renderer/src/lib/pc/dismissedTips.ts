// Persistence for set-review tips the user has dismissed. Scoped per species so
// a dismissal reflects a fact about their game ("Cobblemon can't teach Toxapex
// Scald") and applies to every copy of that species, surviving restarts.
import type { OptSuggestion } from './optimize';

const STORAGE_KEY = 'cobblemon-dismissed-tips';

/** Combine a species id and a suggestion key into one stable storage token. */
export function dismissalId(speciesId: string, suggestionKey: string): string {
  return `${speciesId}::${suggestionKey}`;
}

export function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function persist(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage full / unavailable - dismissals just won't persist this session */
  }
}

/** Return a new set with the dismissal added or removed, persisting the result. */
export function toggleDismissed(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  persist(next);
  return next;
}

/** Split a review into the tips still showing and the ones dismissed for this species. */
export function partitionDismissed(
  suggestions: OptSuggestion[],
  speciesId: string,
  dismissed: Set<string>,
): { active: OptSuggestion[]; hidden: OptSuggestion[] } {
  const active: OptSuggestion[] = [];
  const hidden: OptSuggestion[] = [];
  for (const s of suggestions) {
    (dismissed.has(dismissalId(speciesId, s.key)) ? hidden : active).push(s);
  }
  return { active, hidden };
}
