/**
 * Battle-helper sanity battery - "would a NatDex OU player agree?" scenarios
 * for the full reducer -> predictor -> expectimax pipeline. These are coarse
 * behavioral checks (the precise EVs are covered by search.test.ts): when the
 * board has one obviously right play, recommend() must find it.
 */
import { describe, expect, it } from 'vitest';
import { emptyBattleState, makeId, makePokemon, type BattleState } from '../state';
import { applyEvent } from '../events';
import { applyEventAndPredict } from '../predictor/predictor';
import type { PredictorContext } from '../predictor/types';
import { recommend } from './expectimax';
import type { Move, Pokemon } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures - minimal NatDex-flavored cast
// ---------------------------------------------------------------------------

const species = (over: Partial<Pokemon>): Pokemon =>
  ({
    id: 'mon',
    name: 'Mon',
    dex: 1,
    types: ['normal'],
    abilities: ['Pressure'],
    hiddenAbilities: [],
    baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 },
    eggGroups: [],
    height: 10,
    weight: 100,
    labels: [],
    moves: [],
    ...over,
  }) as Pokemon;

const garchomp = species({
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  moves: [
    { learn: '1', move: 'earthquake' },
    { learn: '1', move: 'outrage' },
    { learn: '1', move: 'stoneedge' },
    { learn: '1', move: 'swordsdance' },
  ],
});

const weavile = species({
  id: 'weavile',
  name: 'Weavile',
  dex: 461,
  types: ['dark', 'ice'],
  abilities: ['Pressure'],
  baseStats: { hp: 70, atk: 120, def: 65, spa: 45, spd: 85, spe: 125 },
  moves: [
    { learn: '1', move: 'tripleaxel' },
    { learn: '1', move: 'knockoff' },
    { learn: '1', move: 'iceshard' },
  ],
});

const skarmory = species({
  id: 'skarmory',
  name: 'Skarmory',
  dex: 227,
  types: ['steel', 'flying'],
  abilities: ['Sturdy'],
  baseStats: { hp: 65, atk: 80, def: 140, spa: 40, spd: 70, spe: 70 },
  moves: [
    { learn: '1', move: 'bravebird' },
    { learn: '1', move: 'roost' },
    { learn: '1', move: 'spikes' },
  ],
});

const MOVES: Record<string, Move> = {
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical', power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'allAdjacent', flags: ['contact'] },
  outrage: { id: 'outrage', name: 'Outrage', type: 'dragon', category: 'Physical', power: 120, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  stoneedge: { id: 'stoneedge', name: 'Stone Edge', type: 'rock', category: 'Physical', power: 100, accuracy: 80, pp: 5, priority: 0, desc: '', target: 'normal', flags: [] },
  swordsdance: { id: 'swordsdance', name: 'Swords Dance', type: 'normal', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: ['snatch'] },
  tripleaxel: { id: 'tripleaxel', name: 'Triple Axel', type: 'ice', category: 'Physical', power: 120, accuracy: 90, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  knockoff: { id: 'knockoff', name: 'Knock Off', type: 'dark', category: 'Physical', power: 65, accuracy: 100, pp: 20, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  iceshard: { id: 'iceshard', name: 'Ice Shard', type: 'ice', category: 'Physical', power: 40, accuracy: 100, pp: 30, priority: 1, desc: '', target: 'normal', flags: [] },
  bravebird: { id: 'bravebird', name: 'Brave Bird', type: 'flying', category: 'Physical', power: 120, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  roost: { id: 'roost', name: 'Roost', type: 'flying', category: 'Status', power: 0, accuracy: true, pp: 10, priority: 0, desc: '', target: 'self', flags: ['heal'] },
  spikes: { id: 'spikes', name: 'Spikes', type: 'ground', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'foeSide', flags: ['reflectable'] },
};

const ctx: PredictorContext = {
  pokemonByName: { garchomp, weavile, skarmory },
  moves: MOVES,
};

const ADAMANT_252 = {
  nature: 'Adamant',
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
};

function reveal(
  s: BattleState,
  sp: Pokemon,
  side: 'player' | 'opponent',
  slot: number,
  moves: string[],
  extra: Partial<Parameters<typeof makePokemon>[1]> = {},
): BattleState {
  const bp = makePokemon(
    sp,
    {
      speciesName: sp.name,
      level: 100,
      ability: sp.abilities[0],
      item: null,
      ...ADAMANT_252,
      moves: moves.map((name) => ({ name })),
      ...extra,
    },
    makeId(side, slot),
    { isOpponent: side === 'opponent', source: side === 'opponent' ? 'INFERRED' : 'KNOWN' },
  );
  const ev = { type: 'PokemonRevealed' as const, side, slot, pokemon: bp };
  return side === 'opponent' ? applyEventAndPredict(s, ev, ctx) : applyEvent(s, ev);
}

// ---------------------------------------------------------------------------

describe('battle helper sanity battery', () => {
  it('takes the guaranteed KO on a weakened opponent', () => {
    let s = emptyBattleState();
    s = reveal(s, garchomp, 'player', 0, ['Earthquake', 'Outrage', 'Stone Edge', 'Swords Dance']);
    s = reveal(s, weavile, 'opponent', 0, ['Triple Axel', 'Knock Off', 'Ice Shard']);
    s = applyEvent(s, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } });
    // Weavile chipped to ~15% - any strong hit closes the game.
    const maxHp = s.sides.opponent.team[0]!.battle.maxHP;
    s = applyEvent(s, {
      type: 'Damaged',
      target: makeId('opponent', 0),
      amount: Math.floor(maxHp * 0.85),
      cause: 'chip',
    });

    const recs = recommend(s, ctx, { depth: 1, topKSets: 2, includeSwitches: false });
    expect(recs.length).toBeGreaterThan(0);
    const top = recs[0];
    // Attacking must beat setting up while the opponent is in KO range.
    expect((top.action as { move?: string }).move).not.toBe('Swords Dance');
    expect(top.damagePreview?.ko.chance ?? 0).toBeGreaterThan(0);
  });

  it('switches out of a hopeless 4x-weak matchup when a resist sits on the bench', () => {
    let s = emptyBattleState();
    // Garchomp (4x ice-weak, outsped) in on Weavile; Skarmory resists both STABs.
    s = reveal(s, garchomp, 'player', 0, ['Earthquake', 'Outrage', 'Stone Edge', 'Swords Dance'], {
      nature: 'Adamant',
    });
    s = reveal(s, skarmory, 'player', 1, ['Brave Bird', 'Roost', 'Spikes'], {
      nature: 'Impish',
      evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
    });
    s = reveal(s, weavile, 'opponent', 0, ['Triple Axel', 'Knock Off', 'Ice Shard'], {
      nature: 'Jolly',
    });
    s = applyEvent(s, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } });

    const recs = recommend(s, ctx, { depth: 2, topKSets: 2, includeSwitches: true });
    expect(recs.length).toBeGreaterThan(0);
    const top = recs[0];
    expect(top.action.kind).toBe('switch');
  });

  it('returns fully-populated explanations on every recommendation', () => {
    let s = emptyBattleState();
    s = reveal(s, garchomp, 'player', 0, ['Earthquake', 'Outrage', 'Stone Edge', 'Swords Dance']);
    s = reveal(s, weavile, 'opponent', 0, ['Triple Axel', 'Knock Off', 'Ice Shard']);
    s = applyEvent(s, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } });

    const recs = recommend(s, ctx, { depth: 1, topKSets: 2, includeSwitches: false });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.summary.length).toBeGreaterThan(0);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(r.reasoning)).toBe(true);
      expect(Array.isArray(r.assumptions)).toBe(true);
    }
    expect(recs[0].principalVariation.length).toBeGreaterThan(0);
    expect(recs[0].threatAnalysis).not.toBeNull();
  });
});
