import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { persistKey, readStorage } from './storage';

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();
  (globalThis as { localStorage?: Pick<Storage, 'getItem'> }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
  };
});

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('readStorage', () => {
  it('prefers the current key', () => {
    store.set('stablab:owned-items', 'new');
    store.set('cobblemon-owned-items', 'old');
    expect(readStorage('stablab:owned-items')).toBe('new');
  });

  it('falls back to the key an earlier build used', () => {
    store.set('cobblemon-counter-drafts', '[]');
    expect(readStorage('stablab:counter-drafts')).toBe('[]');
    store.set('cobblemon-persist:breeding:male', '"x"');
    expect(readStorage(persistKey('breeding:male'))).toBe('"x"');
  });

  it('returns null when nothing is stored', () => {
    expect(readStorage('stablab:fx')).toBeNull();
    expect(readStorage('stablab:unknown')).toBeNull();
  });

  it('returns null without localStorage', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(readStorage('stablab:fx')).toBeNull();
  });
});
