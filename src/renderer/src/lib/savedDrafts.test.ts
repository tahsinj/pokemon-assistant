import { afterEach, describe, it, expect } from 'vitest';
import { addDraft, loadSavedDrafts, removeDraft, type SavedDraft } from './savedDrafts';

const base: SavedDraft[] = [
  { id: 'a', label: 'Old', opponents: [{ speciesId: 'garchomp', level: 100 }], createdAt: 1 },
];

describe('addDraft', () => {
  it('prepends a new draft with the given label and opponents', () => {
    const next = addDraft(base, 'Rival Mira', [
      { speciesId: 'gholdengo', level: 75 },
      { speciesId: 'slaking', level: 75 },
    ]);
    expect(next).toHaveLength(2);
    expect(next[0].label).toBe('Rival Mira');
    expect(next[0].opponents).toEqual([
      { speciesId: 'gholdengo', level: 75 },
      { speciesId: 'slaking', level: 75 },
    ]);
    expect(next[0].id).toBeTruthy();
    expect(next[1].id).toBe('a'); // existing kept after the new one
  });

  it('does not mutate the input list', () => {
    const copy = [...base];
    addDraft(base, 'x', []);
    expect(base).toEqual(copy);
  });
});

describe('removeDraft', () => {
  it('removes the draft with the matching id', () => {
    const list = addDraft(base, 'New', []);
    const id = list[0].id;
    const next = removeDraft(list, id);
    expect(next.map((d) => d.id)).toEqual(['a']);
  });

  it('is a no-op for an unknown id', () => {
    expect(removeDraft(base, 'nope')).toEqual(base);
  });
});

describe('loadSavedDrafts', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('rewrites species ids saved by older builds', () => {
    const saved = [{ id: 'x', label: 'Old', opponents: [{ speciesId: 'great tusk', level: 100 }], createdAt: 1 }];
    (globalThis as { localStorage?: Pick<Storage, 'getItem'> }).localStorage = {
      getItem: (k: string) => (k === 'cobblemon-counter-drafts' ? JSON.stringify(saved) : null),
    };
    expect(loadSavedDrafts()[0].opponents[0].speciesId).toBe('greattusk');
  });
});
