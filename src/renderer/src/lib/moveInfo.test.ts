import { describe, expect, it } from 'vitest';
import { buildLearnerIndex, typeCoverage, priorityLabel } from './moveInfo';
import type { Pokemon } from './types';

const mon = (over: Partial<Pokemon> & Pick<Pokemon, 'id' | 'name' | 'dex' | 'moves'>): Pokemon =>
  ({ types: ['Normal'], abilities: [], hiddenAbilities: [], baseStats: {}, ...over } as unknown as Pokemon);

describe('typeCoverage', () => {
  it('splits defenders into super/resisted/immune by the type chart', () => {
    const fire = typeCoverage('fire');
    expect(fire.strong).toContain('grass');
    expect(fire.strong).toContain('steel');
    expect(fire.weak).toContain('water');
    // Ground is immune to Electric, not Fire - sanity that immune is type-specific.
    expect(typeCoverage('electric').immune).toContain('ground');
  });

  it('returns empty coverage for a non-damaging / unknown type', () => {
    expect(typeCoverage('???')).toEqual({ strong: [], weak: [], immune: [] });
  });
});

describe('buildLearnerIndex', () => {
  it('reverses learnsets, records lowest level, and de-dupes by dex', () => {
    const idx = buildLearnerIndex([
      mon({ id: 'pikachu', name: 'Pikachu', dex: 25, moves: [
        { learn: '5', move: 'thunderbolt' },
        { learn: '1', move: 'thunderbolt' },
        { learn: 'tm', move: 'thunderbolt' },
      ] }),
      // Same dex as a "form" - should collapse to one learner row.
      mon({ id: 'pikachu-cap', name: 'Pikachu-Cap', dex: 25, moves: [{ learn: 'tm', move: 'thunderbolt' }] }),
      mon({ id: 'charmander', name: 'Charmander', dex: 4, moves: [{ learn: 'egg', move: 'thunderbolt' }] }),
    ]);
    const learners = idx.get('thunderbolt')!;
    // De-duped to two dex numbers, sorted ascending by dex.
    expect(learners.map((l) => l.dex)).toEqual([4, 25]);
    const pika = learners.find((l) => l.dex === 25)!;
    expect(pika.level).toBe(1); // lowest level wins
    expect(pika.methods).toEqual(expect.arrayContaining(['level', 'tm']));
  });
});

describe('priorityLabel', () => {
  it('describes the bracket', () => {
    expect(priorityLabel(0)).toBe('Normal');
    expect(priorityLabel(1)).toContain('+1');
    expect(priorityLabel(-6)).toContain('moves last');
  });
});
