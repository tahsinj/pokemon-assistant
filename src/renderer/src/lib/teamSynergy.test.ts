import { describe, expect, it } from 'vitest';
import { suggestTeammates } from './teamSynergy';
import type { Pokemon } from './types';
import type { SmogonBundle } from './smogon';

const mon = (id: string, types: string[], over: Partial<Pokemon> = {}): Pokemon =>
  ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    dex: 1,
    types,
    abilities: [],
    hiddenAbilities: [],
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
    eggGroups: [],
    moves: [],
    height: 10,
    weight: 100,
    ...over,
  }) as Pokemon;

const garchomp = mon('garchomp', ['dragon', 'ground']);
const dragonite = mon('dragonite', ['dragon', 'flying']);
const skarmory = mon('skarmory', ['steel', 'flying']);
const flygon = mon('flygon', ['ground', 'dragon']);
const heracross = mon('heracross', ['bug', 'fighting']);
const gholdengo = mon('gholdengo', ['steel', 'ghost']);

const bundle: SmogonBundle = {
  meta: { format: 'gen9nationaldex', label: 'NatDex OU', month: '2026-05', cutoff: 1630, battles: 1, fetchedAt: '' },
  species: {
    garchomp: {
      name: 'Garchomp',
      usage: 0.11,
      rank: 12,
      abilities: [],
      items: [],
      spreads: [],
      moves: [],
      teraTypes: [],
      teammates: [{ id: 'gholdengo', name: 'Gholdengo', pct: 25 }],
      checks: [],
    },
    gholdengo: {
      name: 'Gholdengo',
      usage: 0.25,
      rank: 1,
      abilities: [],
      items: [],
      spreads: [],
      moves: [],
      teraTypes: [],
      teammates: [],
      checks: [],
    },
  },
};

describe('suggestTeammates', () => {
  it('never suggests current team members', () => {
    const out = suggestTeammates([garchomp], [garchomp, skarmory], bundle, 6);
    expect(out.map((s) => s.p.id)).not.toContain('garchomp');
  });

  it('prefers a candidate that patches a stacked weakness over one that piles on', () => {
    // garchomp + dragonite are both 4x/2x weak to Ice; skarmory resists Ice,
    // flygon adds a third Ice weakness.
    const out = suggestTeammates([garchomp, dragonite], [skarmory, flygon], null, 2);
    expect(out[0].p.id).toBe('skarmory');
    expect(out[0].reasons.join(' ').toLowerCase()).toContain('ice');
  });

  it('boosts candidates with high Smogon co-usage and says so', () => {
    // heracross and gholdengo patch nothing relevant; co-usage breaks the tie.
    const out = suggestTeammates([garchomp], [heracross, gholdengo], bundle, 2);
    expect(out[0].p.id).toBe('gholdengo');
    expect(out[0].reasons.join(' ')).toMatch(/Garchomp teams/i);
  });

  it('falls back to usage staples for an empty team', () => {
    const out = suggestTeammates([], [garchomp, gholdengo, heracross], bundle, 2);
    expect(out[0].p.id).toBe('gholdengo'); // highest usage
    expect(out.length).toBe(2);
  });

  it('works without a smogon bundle at all', () => {
    const out = suggestTeammates([garchomp, dragonite], [skarmory, heracross], null, 2);
    expect(out.length).toBe(2);
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it('rewards a wallbreaker that completes a slow-pivot momentum core', () => {
    // Slow Teleport pivot on the team; a frail breaker should outrank a vanilla
    // mon of the same typing (momentum is the only differentiator).
    const slowPivot = mon('slowking', ['water'], {
      baseStats: { hp: 100, atk: 60, def: 100, spa: 60, spd: 100, spe: 50 },
      moves: [{ learn: '1', move: 'teleport' }] as Pokemon['moves'],
    });
    const breaker = mon('zard', ['electric'], { baseStats: { hp: 60, atk: 50, def: 50, spa: 130, spd: 50, spe: 130 } });
    const vanilla = mon('vanilla', ['electric']);
    const out = suggestTeammates([slowPivot], [vanilla, breaker], null, 2);
    expect(out[0].p.id).toBe('zard');
    expect(out[0].reasons.join(' ').toLowerCase()).toContain('slow pivot');
  });
});
