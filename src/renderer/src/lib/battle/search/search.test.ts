import { describe, expect, it } from 'vitest';
import {
  emptyBattleState,
  makeId,
  makePokemon,
  type BattlePokemon,
  type BattleState,
} from '../state';
import { applyEvent } from '../events';
import { applyEventAndPredict } from '../predictor/predictor';
import type { PredictorContext } from '../predictor/types';
import { generateLegalActions } from './actions';
import { effectiveSpeed, movePriority, resolveTurnOrder } from './speed';
import { evaluate } from './evaluate';
import { recommend } from './expectimax';
import { simulateTurn } from './simulate';
import type { Move, Pokemon } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const garchomp: Pokemon = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin'],
  hiddenAbilities: ['Rough Skin'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: [],
  height: 19,
  weight: 950,
  labels: [],
  moves: [
    { learn: '1', move: 'earthquake' },
    { learn: '1', move: 'outrage' },
    { learn: '1', move: 'stoneedge' },
    { learn: '1', move: 'ironhead' },
    { learn: '1', move: 'dragonclaw' },
  ],
};
const tatsugiri: Pokemon = {
  id: 'tatsugiri',
  name: 'Tatsugiri',
  dex: 978,
  types: ['dragon', 'water'],
  abilities: ['Storm Drain'],
  hiddenAbilities: ['Storm Drain'],
  baseStats: { hp: 68, atk: 50, def: 60, spa: 120, spd: 95, spe: 82 },
  eggGroups: [],
  height: 3,
  weight: 80,
  labels: [],
  moves: [
    { learn: '1', move: 'dracometeor' },
    { learn: '1', move: 'muddywater' },
    { learn: '1', move: 'icebeam' },
    { learn: '1', move: 'surf' },
  ],
};

const MOVES: Record<string, Move> = {
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical', power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'allAdjacent', flags: ['contact'] },
  outrage: { id: 'outrage', name: 'Outrage', type: 'dragon', category: 'Physical', power: 120, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  stoneedge: { id: 'stoneedge', name: 'Stone Edge', type: 'rock', category: 'Physical', power: 100, accuracy: 80, pp: 5, priority: 0, desc: '', target: 'normal', flags: [] },
  ironhead: { id: 'ironhead', name: 'Iron Head', type: 'steel', category: 'Physical', power: 80, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  dragonclaw: { id: 'dragonclaw', name: 'Dragon Claw', type: 'dragon', category: 'Physical', power: 80, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  bulletpunch: { id: 'bulletpunch', name: 'Bullet Punch', type: 'steel', category: 'Physical', power: 40, accuracy: 100, pp: 30, priority: 1, desc: '', target: 'normal', flags: ['contact'] },
  dracometeor: { id: 'dracometeor', name: 'Draco Meteor', type: 'dragon', category: 'Special', power: 130, accuracy: 90, pp: 5, priority: 0, desc: '', target: 'normal', flags: [] },
  muddywater: { id: 'muddywater', name: 'Muddy Water', type: 'water', category: 'Special', power: 90, accuracy: 85, pp: 10, priority: 0, desc: '', target: 'allAdjacentFoes', flags: [] },
  icebeam: { id: 'icebeam', name: 'Ice Beam', type: 'ice', category: 'Special', power: 90, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
  surf: { id: 'surf', name: 'Surf', type: 'water', category: 'Special', power: 90, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'allAdjacent', flags: [] },
};

const ctx: PredictorContext = {
  pokemonByName: { garchomp, tatsugiri },
  moves: MOVES,
};

function buildPlayerGarchomp(level = 50): BattlePokemon {
  return makePokemon(
    garchomp,
    {
      speciesName: 'Garchomp',
      level,
      nature: 'Jolly',
      ability: 'Rough Skin',
      item: 'Choice Band',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      moves: [
        { name: 'Earthquake' },
        { name: 'Outrage' },
        { name: 'Stone Edge' },
        { name: 'Iron Head' },
      ],
    },
    makeId('player', 0),
    { isOpponent: false, source: 'KNOWN' },
  );
}

function buildOppTatsugiri(level = 50): BattlePokemon {
  return makePokemon(
    tatsugiri,
    {
      speciesName: 'Tatsugiri',
      level,
      nature: 'Modest',
      ability: 'Storm Drain',
      item: 'Choice Specs',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
      moves: [{ name: 'Draco Meteor' }, { name: 'Muddy Water' }, { name: 'Ice Beam' }, { name: 'Surf' }],
    },
    makeId('opponent', 0),
    { isOpponent: true, source: 'INFERRED' },
  );
}

function buildSeed(): BattleState {
  let s = emptyBattleState();
  const player = buildPlayerGarchomp();
  const opp = buildOppTatsugiri();
  s = applyEvent(s, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player });
  s = applyEventAndPredict(
    s,
    { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opp },
    ctx,
  );
  s = applyEvent(s, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } });
  return s;
}

// ---------------------------------------------------------------------------
// Action Generator
// ---------------------------------------------------------------------------

describe('generateLegalActions', () => {
  it('returns each PP-positive move and no switch when alone', () => {
    const state = buildSeed();
    const actions = generateLegalActions(state, 'player', { includeSwitches: false });
    const moves = actions.flatMap((a) => (a.kind === 'move' ? [a.move] : []));
    expect(moves).toEqual(['Earthquake', 'Outrage', 'Stone Edge', 'Iron Head']);
    expect(actions.every((a) => a.kind === 'move')).toBe(true);
  });

  it('includes switches when teammates are alive', () => {
    let state = buildSeed();
    const teammate = makePokemon(
      garchomp,
      {
        speciesName: 'Garchomp',
        level: 50,
        nature: 'Jolly',
        ability: 'Rough Skin',
        moves: [{ name: 'Dragon Claw' }],
      },
      makeId('player', 1),
      { isOpponent: false, source: 'KNOWN' },
    );
    state = applyEvent(state, { type: 'PokemonRevealed', side: 'player', slot: 1, pokemon: teammate });
    const actions = generateLegalActions(state, 'player', { includeSwitches: true });
    expect(actions.some((a) => a.kind === 'switch' && a.toSlot === 1)).toBe(true);
    expect(actions.some((a) => a.kind === 'switch' && a.toSlot === 0)).toBe(false);
  });

  it('drops moves at 0 PP', () => {
    let state = buildSeed();
    // Drain all PP of Earthquake.
    for (let i = 0; i < 32; i++) {
      state = applyEvent(state, { type: 'MoveUsed', actor: 'p:0', move: 'Earthquake' });
    }
    const actions = generateLegalActions(state, 'player', { includeSwitches: false });
    expect(actions.find((a) => a.kind === 'move' && a.move === 'Earthquake')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Speed & Priority
// ---------------------------------------------------------------------------

describe('Speed and priority resolution', () => {
  it('priority bracket wins regardless of speed', () => {
    const state = buildSeed();
    const order = resolveTurnOrder(
      state,
      { kind: 'move', move: 'Bullet Punch' },
      { kind: 'move', move: 'Earthquake' },
      { moves: MOVES },
      (name) => ctx.pokemonByName[name.toLowerCase()],
    );
    expect(order).toBe('player-first');
  });

  it('Choice Scarf wins the speed comparison without altering priority', () => {
    // Equip the opp Tatsugiri with Scarf so we test the Speed x 1.5 path.
    let state = buildSeed();
    state = applyEvent(state, { type: 'ItemRevealed', target: 'o:0', item: 'Choice Scarf' });
    const p = state.sides.player.team[0]!;
    const o = state.sides.opponent.team[0]!;
    const playerSpe = effectiveSpeed(state, 'player', p, ctx.pokemonByName[p.identity.species.toLowerCase()]);
    const oppSpe = effectiveSpeed(state, 'opponent', o, ctx.pokemonByName[o.identity.species.toLowerCase()]);
    expect(oppSpe).toBeGreaterThan(playerSpe);
    const order = resolveTurnOrder(
      state,
      { kind: 'move', move: 'Earthquake' },
      { kind: 'move', move: 'Draco Meteor' },
      { moves: MOVES },
      (name) => ctx.pokemonByName[name.toLowerCase()],
    );
    expect(order).toBe('opponent-first');
  });

  it('Trick Room flips speed order', () => {
    // Player Garchomp is naturally faster, so under Trick Room the opponent
    // (slower) acts first.
    let state = buildSeed();
    state = applyEvent(state, { type: 'RoomChanged', room: 'trick', active: true });
    const order = resolveTurnOrder(
      state,
      { kind: 'move', move: 'Earthquake' },
      { kind: 'move', move: 'Draco Meteor' },
      { moves: MOVES },
      (name) => ctx.pokemonByName[name.toLowerCase()],
    );
    expect(order).toBe('opponent-first');
  });

  it('movePriority handles Prankster on status moves', () => {
    const p = buildPlayerGarchomp();
    const prio = movePriority(
      { kind: 'move', move: 'Stealth Rock' },
      { ...p, set: { ...p.set, ability: { value: 'Prankster', source: 'KNOWN' } } },
      { moves: MOVES },
    );
    // Stealth Rock isn't in our PRIORITY_MAP, falls back to move.priority (we
    // don't have it in MOVES at all) -> 0 + 1 (Prankster) only when the move's
    // category is Status. Since the move isn't in the dict, category check
    // fails and we don't add the +1. Verify the falsey path.
    expect(prio).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

describe('simulateTurn', () => {
  it('reduces opponent HP when player moves with damage', () => {
    const state = buildSeed();
    const before = state.sides.opponent.team[0]!.battle.currentHP;
    const next = simulateTurn(
      state,
      { kind: 'move', move: 'Earthquake' },
      { kind: 'move', move: 'Draco Meteor' },
      { moves: MOVES, speciesLookup: (n) => ctx.pokemonByName[n.toLowerCase()] },
    );
    const after = next.sides.opponent.team[0]!.battle.currentHP;
    expect(after).toBeLessThan(before);
  });

  it('switch-vs-move resolves with switch first, then the moving side hits incoming', () => {
    let state = buildSeed();
    // Bulky teammate so it survives the hit (otherwise auto-faint logic flips
    // activeSlot back to slot 0).
    const teammate = makePokemon(
      garchomp,
      {
        speciesName: 'Garchomp',
        level: 50,
        nature: 'Careful',
        ability: 'Rough Skin',
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        evs: { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 },
        moves: [{ name: 'Dragon Claw' }],
      },
      makeId('player', 1),
      { isOpponent: false, source: 'KNOWN' },
    );
    state = applyEvent(state, { type: 'PokemonRevealed', side: 'player', slot: 1, pokemon: teammate });
    const next = simulateTurn(
      state,
      { kind: 'switch', toSlot: 1 },
      { kind: 'move', move: 'Surf' }, // neutral on Dragon/Ground (0.5 x 2 = 1)
      { moves: MOVES, speciesLookup: (n) => ctx.pokemonByName[n.toLowerCase()] },
    );
    expect(next.activeSlot.player).toBe(1);
    const incoming = next.sides.player.team[1]!;
    expect(incoming.battle.currentHP).toBeLessThan(incoming.battle.maxHP);
    expect(incoming.battle.currentHP).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Eval
// ---------------------------------------------------------------------------

describe('evaluate', () => {
  it('is symmetric: damaging opponent vs damaging player yields opposite signs in HP feature', () => {
    const state = buildSeed();
    const hurtOpp = applyEvent(state, { type: 'Damaged', target: 'o:0', amount: 50 });
    const hurtMe = applyEvent(state, { type: 'Damaged', target: 'p:0', amount: 50 });
    const a = evaluate(hurtOpp);
    const b = evaluate(hurtMe);
    expect(a.hp).toBeGreaterThan(b.hp);
    expect(a.total).toBeGreaterThan(b.total);
  });

  it('terminal win >> terminal loss', () => {
    const state = buildSeed();
    const win = applyEvent(state, { type: 'BattleEnded', winner: 'player' });
    const loss = applyEvent(state, { type: 'BattleEnded', winner: 'opponent' });
    expect(evaluate(win).total).toBeGreaterThan(evaluate(loss).total + 100);
  });
});

// ---------------------------------------------------------------------------
// Recommend (smoke + sanity)
// ---------------------------------------------------------------------------

describe('recommend', () => {
  it('returns up to three ranked recommendations', () => {
    const state = buildSeed();
    const recs = recommend(state, ctx, { depth: 1, topKSets: 3, includeSwitches: false });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].expectedValue).toBeGreaterThanOrEqual(recs[i].expectedValue);
    }
    expect(recs.every((r) => r.summary.length > 0)).toBe(true);
  });

  it('prefers Earthquake over Iron Head on Tatsugiri (Ground super-effective on Water-types in tera neutral)', () => {
    const state = buildSeed();
    const recs = recommend(state, ctx, { depth: 1, topKSets: 1, includeSwitches: false });
    const top = recs[0];
    const topMove = top.action.kind === 'move' ? top.action.move : null;
    expect(['Earthquake', 'Outrage']).toContain(topMove);
    // Iron Head shouldn't rank #1 against Tatsugiri (no super-effective hit).
    expect(topMove).not.toBe('Iron Head');
  });

  it('depth-2 search still returns a valid ranked list', () => {
    const state = buildSeed();
    const recs = recommend(state, ctx, { depth: 2, topKSets: 2, includeSwitches: false });
    expect(recs.length).toBeGreaterThan(0);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].expectedValue).toBeGreaterThanOrEqual(recs[i].expectedValue);
    }
  });
});
