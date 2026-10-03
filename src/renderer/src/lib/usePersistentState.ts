/**
 * `useState`, but the value is mirrored to localStorage so it survives page
 * navigation (every tab in App.tsx fully unmounts when you switch away) and app
 * restarts. Pages like Breeding and the PC editor hold in-progress input that
 * should not vanish the moment you click elsewhere.
 *
 * Keys are namespaced under a shared prefix. Reads/writes are guarded so the
 * hook is a no-op (behaves like plain useState) when localStorage is
 * unavailable - e.g. the node/vitest environment.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { persistKey, readStorage } from './storage';

function readStored<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = readStorage(persistKey(key));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() =>
    readStored(key, typeof initial === 'function' ? (initial as () => T)() : initial),
  );

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(persistKey(key), JSON.stringify(state));
    } catch {
      /* ignore quota / serialization errors */
    }
  }, [key, state]);

  return [state, setState];
}

/** Drop a persisted value (e.g. a "reset" / "clear draft" action). */
export function clearPersistentState(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(persistKey(key));
  } catch {
    /* ignore */
  }
}
