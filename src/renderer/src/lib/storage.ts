/**
 * localStorage reads that fall back to the key an earlier build used, so
 * renaming a key never loses saved data. Writes always go to the new key.
 * Every old key name lives here and nowhere else.
 */

const PERSIST_PREFIX = 'stablab:persist:';
const LEGACY_PERSIST_PREFIX = 'cobblemon-persist:';

const LEGACY_KEYS: Record<string, string> = {
  'stablab:fx': 'cobblemon-fx',
  'stablab:owned-items': 'cobblemon-owned-items',
  'stablab:dismissed-tips': 'cobblemon-dismissed-tips',
  'stablab:counter-drafts': 'cobblemon-counter-drafts',
};

export function persistKey(name: string): string {
  return PERSIST_PREFIX + name;
}

function legacyKeyFor(key: string): string | null {
  if (key.startsWith(PERSIST_PREFIX)) return LEGACY_PERSIST_PREFIX + key.slice(PERSIST_PREFIX.length);
  return LEGACY_KEYS[key] ?? null;
}

/** The stored value, or the one under the key earlier builds used. Null when absent or storage is unavailable. */
export function readStorage(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const value = localStorage.getItem(key);
    if (value != null) return value;
    const legacy = legacyKeyFor(key);
    return legacy ? localStorage.getItem(legacy) : null;
  } catch {
    return null;
  }
}
