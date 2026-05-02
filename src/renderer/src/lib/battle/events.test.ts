import { describe, expect, it } from 'vitest';
import {
  emptyBattleState,
  makeId,
  makePokemon,
  type BattlePokemon,
  type SideId,
} from './state';
import { applyEvent, applyEvents, type BattleEvent } from './events';
import type { Pokemon } from '../types';

const garchomp: Pokemon = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin', 'Sand Veil'],
  hiddenAbilities: ['Rough Skin'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: ['monster', 'dragon'],
  height: 19,
  weight: 950,
  labels: [],
  moves: [],
};
const tatsugiri: Pokemon = {
  id: 'tatsugiri',
  name: 'Tatsugiri',
  dex: 978,
  types: ['dragon', 'water'],
  abilities: ['Commander', 'Storm Drain'],
  hiddenAbilities: ['Storm Drain'],
  baseStats: { hp: 68, atk: 50, def: 60, spa: 120, spd: 95, spe: 82 },
  eggGroups: ['water2', 'dragon'],
  height: 3,
  weight: 80,
  labels: [],
  moves: [],
};

function seed(): {
  state: ReturnType<typeof emptyBattleState>;
  player0: BattlePokemon;
  player1: BattlePokemon;
  opponent0: BattlePokemon;
} {
  const player0 = makePokemon(
    garchomp,
    {
      speciesName: 'Garchomp',
      level: 50,
      nature: 'Jolly',
      ability: 'Rough Skin',
      item: 'Choice Band',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      moves: [{ name: 'Earthquake' }, { name: 'Outrage' }],
    },
    makeId('player', 0),
    { isOpponent: false },
  );
  const player1 = makePokemon(
    tatsugiri,
    { speciesName: 'Tatsugiri', nature: 'Timid', moves: [{ name: 'Draco Meteor' }] },
    makeId('player', 1),
    { isOpponent: false },
  );
  const opponent0 = makePokemon(
    tatsugiri,
    { speciesName: 'Tatsugiri', nature: 'Modest', moves: [{ name: 'Draco Meteor' }] },
    makeId('opponent', 0),
    { isOpponent: true },
  );

  let state = emptyBattleState();
  state = applyEvent(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player0 });
  state = applyEvent(state, { type: 'PokemonRevealed', side: 'player', slot: 1, pokemon: player1 });
  state = applyEvent(state, { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opponent0 });
  state = applyEvent(state, {
    type: 'BattleStarted',
    startingActive: { player: 0, opponent: 0 },
  });
  return { state, player0, player1, opponent0 };
}

describe('applyEvent', () => {
  it('initializes turn and marks starting actives as seen', () => {
    const { state } = seed();
    expect(state.turn).toBe(1);
    expect(state.activeSlot.player).toBe(0);
    expect(state.activeSlot.opponent).toBe(0);
    expect(state.sides.player.team[0]?.battle.hasBeenSeen).toBe(true);
    expect(state.sides.opponent.team[0]?.battle.hasBeenSeen).toBe(true);
    expect(state.sides.player.team[1]?.battle.hasBeenSeen).toBe(false);
  });

  it('appends every event to the log without mutating', () => {
    const before = seed().state;
    const after = applyEvent(before, { type: 'MoveUsed', actor: 'p:0', move: 'Earthquake' });
    expect(after.log.length).toBe(before.log.length + 1);
    expect(before.log.length).toBeGreaterThan(0); // before unchanged
    expect(after).not.toBe(before);
  });

  it('clamps HP at 0 on damage and triggers faint', () => {
    const { state } = seed();
    const opp = state.sides.opponent.team[0]!;
    const next = applyEvent(state, {
      type: 'Damaged',
      target: 'o:0',
      amount: opp.battle.maxHP + 100,
      cause: 'Earthquake',
      category: 'Physical',
    });
    expect(next.sides.opponent.team[0]?.battle.currentHP).toBe(0);
    // No alive opponent -> battle ended, player wins.
    expect(next.isOver).toBe(true);
    expect(next.winner).toBe<SideId>('player');
  });

  it('clamps healing at maxHP', () => {
    const { state } = seed();
    let s = applyEvent(state, { type: 'Damaged', target: 'p:0', amount: 50 });
    const before = s.sides.player.team[0]!.battle.currentHP;
    s = applyEvent(s, { type: 'Healed', target: 'p:0', amount: 9999 });
    const after = s.sides.player.team[0]!.battle.currentHP;
    expect(after).toBe(s.sides.player.team[0]!.battle.maxHP);
    expect(after).toBeGreaterThan(before);
  });

  it('resets boosts and volatiles on switch-out', () => {
    const { state } = seed();
    let s = applyEvent(state, { type: 'BoostChanged', target: 'p:0', stat: 'atk', delta: 2 });
    s = applyEvent(s, { type: 'VolatileSet', target: 'p:0', volatile: 'confusion' });
    expect(s.sides.player.team[0]!.battle.boosts.atk).toBe(2);
    s = applyEvent(s, { type: 'Switched', side: 'player', toSlot: 1 });
    expect(s.activeSlot.player).toBe(1);
    expect(s.sides.player.team[0]!.battle.boosts.atk ?? 0).toBe(0);
    expect(s.sides.player.team[0]!.battle.volatiles.confusion).toBeUndefined();
    expect(s.sides.player.team[1]!.meta.switchInsCount).toBe(1);
  });

  it('caps boosts at +-6', () => {
    const { state } = seed();
    let s = state;
    for (let i = 0; i < 10; i++) {
      s = applyEvent(s, { type: 'BoostChanged', target: 'p:0', stat: 'spa', delta: 1 });
    }
    expect(s.sides.player.team[0]!.battle.boosts.spa).toBe(6);
    for (let i = 0; i < 20; i++) {
      s = applyEvent(s, { type: 'BoostChanged', target: 'p:0', stat: 'spa', delta: -1 });
    }
    expect(s.sides.player.team[0]!.battle.boosts.spa).toBe(-6);
  });

  it('stacks spike layers up to 3 and clears with HazardCleared', () => {
    const { state } = seed();
    let s = state;
    for (let i = 0; i < 5; i++) {
      s = applyEvent(s, { type: 'HazardSet', side: 'opponent', hazard: 'spikes' });
    }
    expect(s.sides.opponent.hazards.spikes).toBe(3);
    s = applyEvent(s, { type: 'HazardSet', side: 'opponent', hazard: 'stealthRock' });
    s = applyEvent(s, { type: 'HazardCleared', side: 'opponent' });
    expect(s.sides.opponent.hazards.spikes).toBe(0);
    expect(s.sides.opponent.hazards.stealthRock).toBe(false);
  });

  it('toxic spikes cap at 2', () => {
    const { state } = seed();
    let s = state;
    for (let i = 0; i < 4; i++) {
      s = applyEvent(s, { type: 'HazardSet', side: 'opponent', hazard: 'toxicSpikes' });
    }
    expect(s.sides.opponent.hazards.toxicSpikes).toBe(2);
  });

  it('decrements screen / tailwind / weather / terrain on TurnStarted', () => {
    const { state } = seed();
    let s = applyEvent(state, { type: 'ScreenSet', side: 'player', screen: 'reflect', turns: 5 });
    s = applyEvent(s, { type: 'TailwindSet', side: 'player', turns: 4 });
    s = applyEvent(s, { type: 'WeatherChanged', weather: 'Sun', turns: 5 });
    s = applyEvent(s, { type: 'TerrainChanged', terrain: 'Electric', turns: 5 });
    s = applyEvent(s, { type: 'TurnStarted', turn: 2 });
    expect(s.sides.player.screens.reflect).toBe(4);
    expect(s.sides.player.tailwind).toBe(3);
    expect(s.field.weatherTurns).toBe(4);
    expect(s.field.terrainTurns).toBe(4);
    expect(s.field.weather).toBe('Sun');
  });

  it('weather expires to empty when turns hit zero', () => {
    const { state } = seed();
    let s = applyEvent(state, { type: 'WeatherChanged', weather: 'Sun', turns: 1 });
    s = applyEvent(s, { type: 'TurnStarted', turn: 2 });
    expect(s.field.weather).toBe('');
    expect(s.field.weatherTurns).toBe(0);
  });

  it('records move usage and decrements PP', () => {
    const { state } = seed();
    const before = state.sides.player.team[0]!.set.moves.find((m) => m.name === 'Earthquake')!;
    const startPP = before.ppCurrent;
    const s = applyEvent(state, { type: 'MoveUsed', actor: 'p:0', move: 'Earthquake' });
    const after = s.sides.player.team[0]!.set.moves.find((m) => m.name === 'Earthquake')!;
    expect(after.ppCurrent).toBe(startPP - 1);
    expect(s.sides.player.team[0]!.battle.lastMoveUsed).toBe('Earthquake');
  });

  it('reveals a previously-unknown opponent move', () => {
    const { state } = seed();
    const s = applyEvent(state, { type: 'MoveUsed', actor: 'o:0', move: 'Muddy Water' });
    const moves = s.sides.opponent.team[0]!.set.moves.map((m) => m.name);
    expect(moves).toContain('Muddy Water');
  });

  it('marks ability/item revealed and tags source KNOWN', () => {
    const { state } = seed();
    let s = applyEvent(state, { type: 'AbilityRevealed', target: 'o:0', ability: 'Storm Drain' });
    s = applyEvent(s, { type: 'ItemRevealed', target: 'o:0', item: 'Choice Scarf' });
    expect(s.sides.opponent.team[0]!.set.ability).toEqual({ value: 'Storm Drain', source: 'KNOWN' });
    expect(s.sides.opponent.team[0]!.set.item).toEqual({ value: 'Choice Scarf', source: 'KNOWN' });
  });

  it('replay: applying the log to an empty state reproduces the same state', () => {
    const { state } = seed();
    const events: BattleEvent[] = [
      { type: 'MoveUsed', actor: 'p:0', move: 'Earthquake' },
      { type: 'Damaged', target: 'o:0', amount: 100, cause: 'Earthquake', category: 'Physical' },
      { type: 'BoostChanged', target: 'p:0', stat: 'atk', delta: 1 },
      { type: 'TurnStarted', turn: 2 },
    ];
    const live = applyEvents(state, events);
    const replay = applyEvents(emptyBattleState(), [...state.log, ...events.map((e) => ({ ...e }))]);
    expect(replay.turn).toBe(live.turn);
    expect(replay.sides.opponent.team[0]?.battle.currentHP).toBe(live.sides.opponent.team[0]?.battle.currentHP);
    expect(replay.sides.player.team[0]?.battle.boosts.atk).toBe(live.sides.player.team[0]?.battle.boosts.atk);
    expect(replay.activeSlot).toEqual(live.activeSlot);
  });

  it('terastallization flips the flag and marks teraUsed for the side', () => {
    const { state } = seed();
    const s = applyEvent(state, { type: 'Terastallized', target: 'p:0', teraType: 'Steel' });
    expect(s.sides.player.team[0]!.battle.isTerastallized).toBe(true);
    expect(s.sides.player.teraUsed).toBe(true);
    expect(s.sides.player.team[0]!.set.teraType).toEqual({ value: 'Steel', source: 'KNOWN' });
  });
});
