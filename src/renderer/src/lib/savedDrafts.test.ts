import { describe, it, expect } from 'vitest';
import { addDraft, removeDraft, type SavedDraft } from './savedDrafts';

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
