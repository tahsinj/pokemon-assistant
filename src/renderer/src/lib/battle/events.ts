/**
 * Battle events - discriminated union of everything that can happen in a turn,
 * plus the `applyEvent` reducer that folds an event into a new `BattleState`.
 *
 * The reducer is a pure function over (state, event) - the same input always
 * produces the same output, with no I/O or randomness. Chance-resolution
 * (damage roll, secondary-effect proc, crit) belongs to the search engine;
 * this layer just records *what already happened*.
 */

import { produce } from 'immer';
import type {
  BattlePokemon,
  BattleState,
  PokemonId,
  SideId,
  StatusCondition,
  VolatileData,
  VolatileName,
} from './state';
import { aliveCount, findFirstAliveSlot, makeId, parseId } from './state';
import type { Terrain, Weather } from './types';
import type { StatKey } from '../types';

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type BattleEvent =
  | BattleStartedEvent
  | TurnStartedEvent
  | TurnEndedEvent
  | PokemonRevealedEvent
  | SwitchedEvent
  | MoveUsedEvent
  | DamagedEvent
  | HealedEvent
  | StatusAppliedEvent
  | StatusCuredEvent
  | BoostChangedEvent
  | BoostsResetEvent
  | VolatileSetEvent
  | VolatileClearedEvent
  | WeatherChangedEvent
  | TerrainChangedEvent
  | RoomChangedEvent
  | GravityChangedEvent
  | HazardSetEvent
  | HazardClearedEvent
  | ScreenSetEvent
  | ScreenClearedEvent
  | TailwindSetEvent
  | AbilityRevealedEvent
  | ItemRevealedEvent
  | ItemConsumedEvent
  | TerastallizedEvent
  | FaintedEvent
  | BattleEndedEvent;

interface EventBase {
  /** Wall-clock timestamp the engine recorded the event; used purely for UI. */
  ts?: number;
}

export interface BattleStartedEvent extends EventBase {
  type: 'BattleStarted';
  startingActive: { player: number; opponent: number };
}
export interface TurnStartedEvent extends EventBase {
  type: 'TurnStarted';
  turn: number;
}
export interface TurnEndedEvent extends EventBase {
  type: 'TurnEnded';
}
export interface PokemonRevealedEvent extends EventBase {
  type: 'PokemonRevealed';
  side: SideId;
  slot: number;
  pokemon: BattlePokemon;
}
export interface SwitchedEvent extends EventBase {
  type: 'Switched';
  side: SideId;
  /** Slot index switched in. */
  toSlot: number;
}
export interface MoveUsedEvent extends EventBase {
  type: 'MoveUsed';
  actor: PokemonId;
  move: string;
  /** Whether to decrement PP (default true). */
  consumePP?: boolean;
}
export interface DamagedEvent extends EventBase {
  type: 'Damaged';
  target: PokemonId;
  /** Absolute HP damage (positive). Use HealedEvent for healing. */
  amount: number;
  /** Optional cause label for the log: "Earthquake", "Stealth Rock", "Burn", … */
  cause?: string;
  category?: 'Physical' | 'Special' | 'Status';
}
export interface HealedEvent extends EventBase {
  type: 'Healed';
  target: PokemonId;
  amount: number;
  cause?: string;
}
export interface StatusAppliedEvent extends EventBase {
  type: 'StatusApplied';
  target: PokemonId;
  status: StatusCondition;
}
export interface StatusCuredEvent extends EventBase {
  type: 'StatusCured';
  target: PokemonId;
}
export interface BoostChangedEvent extends EventBase {
  type: 'BoostChanged';
  target: PokemonId;
  stat: StatKey | 'acc' | 'eva';
  delta: number;
}
export interface BoostsResetEvent extends EventBase {
  type: 'BoostsReset';
  target: PokemonId;
}
export interface VolatileSetEvent extends EventBase {
  type: 'VolatileSet';
  target: PokemonId;
  volatile: VolatileName;
  data?: VolatileData;
}
export interface VolatileClearedEvent extends EventBase {
  type: 'VolatileCleared';
  target: PokemonId;
  volatile: VolatileName;
}
export interface WeatherChangedEvent extends EventBase {
  type: 'WeatherChanged';
  weather: Weather;
  /** 0 for permanent (Primordial / Desolate). */
  turns?: number;
}
export interface TerrainChangedEvent extends EventBase {
  type: 'TerrainChanged';
  terrain: Terrain;
  turns?: number;
}
export interface RoomChangedEvent extends EventBase {
  type: 'RoomChanged';
  room: 'trick' | 'magic' | 'wonder';
  active: boolean;
  turns?: number;
}
export interface GravityChangedEvent extends EventBase {
  type: 'GravityChanged';
  active: boolean;
  turns?: number;
}
export interface HazardSetEvent extends EventBase {
  type: 'HazardSet';
  side: SideId;
  hazard: 'stealthRock' | 'spikes' | 'toxicSpikes' | 'stickyWeb' | 'steelsurge';
}
export interface HazardClearedEvent extends EventBase {
  type: 'HazardCleared';
  /** Omit to clear both sides (Defog). */
  side?: SideId;
}
export interface ScreenSetEvent extends EventBase {
  type: 'ScreenSet';
  side: SideId;
  screen: 'reflect' | 'lightScreen' | 'auroraVeil';
  turns?: number; // default 5 (8 w/ Light Clay - caller knows)
}
export interface ScreenClearedEvent extends EventBase {
  type: 'ScreenCleared';
  side: SideId;
  screen: 'reflect' | 'lightScreen' | 'auroraVeil';
}
export interface TailwindSetEvent extends EventBase {
  type: 'TailwindSet';
  side: SideId;
  turns?: number;
}
export interface AbilityRevealedEvent extends EventBase {
  type: 'AbilityRevealed';
  target: PokemonId;
  ability: string;
}
export interface ItemRevealedEvent extends EventBase {
  type: 'ItemRevealed';
  target: PokemonId;
  item: string;
}
export interface ItemConsumedEvent extends EventBase {
  type: 'ItemConsumed';
  target: PokemonId;
}
export interface TerastallizedEvent extends EventBase {
  type: 'Terastallized';
  target: PokemonId;
  /** Tera type forced if revealed; falls back to the set's teraType. */
  teraType?: string;
}
export interface FaintedEvent extends EventBase {
  type: 'Fainted';
  target: PokemonId;
}
export interface BattleEndedEvent extends EventBase {
  type: 'BattleEnded';
  winner: SideId | null;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const DEFAULT_SCREEN_TURNS = 5;
const DEFAULT_TAILWIND_TURNS = 4;
const DEFAULT_WEATHER_TURNS = 5;
const DEFAULT_TERRAIN_TURNS = 5;
const DEFAULT_ROOM_TURNS = 5;
const DEFAULT_GRAVITY_TURNS = 5;

/**
 * Apply one event to the state and return the next immutable snapshot.
 *
 * The event is always appended to `state.log` so the full history is preserved
 * for replay / explanation. Replaying the log from `emptyBattleState()` plus
 * `BattleStarted` should reproduce any later state exactly.
 */
export function applyEvent(state: BattleState, event: BattleEvent): BattleState {
  return produce(state, (draft) => {
    const stamped: BattleEvent = event.ts ? event : { ...event, ts: Date.now() };

    switch (event.type) {
      case 'BattleStarted': {
        draft.turn = 1;
        draft.activeSlot.player = event.startingActive.player;
        draft.activeSlot.opponent = event.startingActive.opponent;
        for (const side of ['player', 'opponent'] as const) {
          const p = draft.sides[side].team[draft.activeSlot[side]];
          if (p) {
            p.battle.hasBeenSeen = true;
            p.meta.switchInsCount = 1;
          }
        }
        break;
      }

      case 'TurnStarted': {
        draft.turn = event.turn;
        // Tick all turn-based counters down.
        decrementSide(draft.sides.player);
        decrementSide(draft.sides.opponent);
        decrementField(draft.field);
        // Reset per-turn meta on every active Pokémon.
        for (const sideKey of ['player', 'opponent'] as const) {
          for (const p of draft.sides[sideKey].team) {
            if (!p) continue;
            p.meta.damageTakenThisTurn = 0;
            p.meta.damageCategoryThisTurn = null;
          }
        }
        break;
      }

      case 'TurnEnded': {
        // Reserved for end-of-turn residual damage etc; for now a no-op marker.
        break;
      }

      case 'PokemonRevealed': {
        const { side, slot, pokemon } = event;
        if (slot < 0 || slot > 5) break;
        const existing = draft.sides[side].team[slot];
        draft.sides[side].team[slot] = {
          ...pokemon,
          id: makeId(side, slot),
          battle: {
            ...pokemon.battle,
            hasBeenSeen: pokemon.battle.hasBeenSeen || !!existing?.battle.hasBeenSeen,
          },
        };
        break;
      }

      case 'Switched': {
        const { side, toSlot } = event;
        const team = draft.sides[side].team;
        if (toSlot < 0 || toSlot >= team.length) break;
        const incoming = team[toSlot];
        if (!incoming) break;
        const prevSlot = draft.activeSlot[side];
        const leaving = team[prevSlot] ?? null;
        if (leaving && leaving.id !== incoming.id) {
          resetOnSwitchOut(leaving);
        }
        draft.activeSlot[side] = toSlot;
        incoming.battle.hasBeenSeen = true;
        incoming.meta.switchInsCount += 1;
        // Hazards apply on switch-in (numeric only; the reducer doesn't compute
        // hazard damage automatically; the user records it via DamagedEvent).
        break;
      }

      case 'MoveUsed': {
        const p = mutPokemon(draft, event.actor);
        if (!p) break;
        p.battle.lastMoveUsed = event.move;
        p.battle.hasBeenSeen = true;
        const slot = p.set.moves.find((m) => m.name.toLowerCase() === event.move.toLowerCase());
        if (slot) {
          if (slot.source === 'DEFAULT') slot.source = 'KNOWN';
          if (event.consumePP !== false && slot.ppCurrent > 0) slot.ppCurrent -= 1;
        } else if (p.identity.isOpponent) {
          // Revealed an unknown opponent move - append it as known.
          p.set.moves.push({ name: event.move, ppCurrent: 15, ppMax: 16, source: 'KNOWN' });
        }
        break;
      }

      case 'Damaged': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        const dmg = Math.max(0, Math.floor(event.amount));
        const before = p.battle.currentHP;
        p.battle.currentHP = Math.max(0, before - dmg);
        const actual = before - p.battle.currentHP;
        p.meta.timesHit += actual > 0 ? 1 : 0;
        p.meta.damageTakenThisTurn += actual;
        if (event.category && event.category !== 'Status') {
          p.meta.damageCategoryThisTurn = event.category;
        }
        if (p.battle.currentHP === 0) {
          markFaint(draft, p);
        }
        break;
      }

      case 'Healed': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        const amt = Math.max(0, Math.floor(event.amount));
        p.battle.currentHP = Math.min(p.battle.maxHP, p.battle.currentHP + amt);
        break;
      }

      case 'StatusApplied': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.battle.status = event.status;
        // Sleep / toxic counters start at 0 and tick up when the engine
        // simulates moves. For now we just reset to 0 on apply.
        p.battle.statusTurns = 0;
        break;
      }

      case 'StatusCured': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.battle.status = null;
        p.battle.statusTurns = 0;
        break;
      }

      case 'BoostChanged': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        const cur = p.battle.boosts[event.stat] ?? 0;
        const next = Math.max(-6, Math.min(6, cur + event.delta));
        p.battle.boosts[event.stat] = next;
        break;
      }

      case 'BoostsReset': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.battle.boosts = {};
        break;
      }

      case 'VolatileSet': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.battle.volatiles[event.volatile] = event.data ?? { turns: 0 };
        break;
      }

      case 'VolatileCleared': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        delete p.battle.volatiles[event.volatile];
        break;
      }

      case 'WeatherChanged': {
        draft.field.weather = event.weather;
        draft.field.weatherTurns = event.weather === '' ? 0 : event.turns ?? DEFAULT_WEATHER_TURNS;
        break;
      }

      case 'TerrainChanged': {
        draft.field.terrain = event.terrain;
        draft.field.terrainTurns = event.terrain === '' ? 0 : event.turns ?? DEFAULT_TERRAIN_TURNS;
        break;
      }

      case 'RoomChanged': {
        const turns = event.active ? event.turns ?? DEFAULT_ROOM_TURNS : 0;
        if (event.room === 'trick') {
          draft.field.isTrickRoom = event.active;
          draft.field.trickRoomTurns = turns;
        } else if (event.room === 'magic') {
          draft.field.isMagicRoom = event.active;
          draft.field.magicRoomTurns = turns;
        } else {
          draft.field.isWonderRoom = event.active;
          draft.field.wonderRoomTurns = turns;
        }
        break;
      }

      case 'GravityChanged': {
        draft.field.isGravity = event.active;
        draft.field.gravityTurns = event.active ? event.turns ?? DEFAULT_GRAVITY_TURNS : 0;
        break;
      }

      case 'HazardSet': {
        const haz = draft.sides[event.side].hazards;
        switch (event.hazard) {
          case 'stealthRock':
            haz.stealthRock = true;
            break;
          case 'spikes':
            haz.spikes = Math.min(3, haz.spikes + 1) as 0 | 1 | 2 | 3;
            break;
          case 'toxicSpikes':
            haz.toxicSpikes = Math.min(2, haz.toxicSpikes + 1) as 0 | 1 | 2;
            break;
          case 'stickyWeb':
            haz.stickyWeb = true;
            break;
          case 'steelsurge':
            haz.steelsurge = true;
            break;
        }
        break;
      }

      case 'HazardCleared': {
        const sides = event.side ? [event.side] : (['player', 'opponent'] as const);
        for (const s of sides) {
          draft.sides[s].hazards = {
            stealthRock: false,
            spikes: 0,
            toxicSpikes: 0,
            stickyWeb: false,
            steelsurge: false,
          };
        }
        break;
      }

      case 'ScreenSet': {
        const sc = draft.sides[event.side].screens;
        sc[event.screen] = event.turns ?? DEFAULT_SCREEN_TURNS;
        break;
      }

      case 'ScreenCleared': {
        const sc = draft.sides[event.side].screens;
        sc[event.screen] = 0;
        break;
      }

      case 'TailwindSet': {
        draft.sides[event.side].tailwind = event.turns ?? DEFAULT_TAILWIND_TURNS;
        break;
      }

      case 'AbilityRevealed': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.set.ability = { value: event.ability, source: 'KNOWN' };
        break;
      }

      case 'ItemRevealed': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.set.item = { value: event.item, source: 'KNOWN' };
        break;
      }

      case 'ItemConsumed': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.meta.itemConsumed = true;
        p.set.item = { value: null, source: 'KNOWN' };
        break;
      }

      case 'Terastallized': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.battle.isTerastallized = true;
        if (event.teraType) {
          p.set.teraType = { value: event.teraType, source: 'KNOWN' };
        }
        const { side } = parseId(event.target);
        draft.sides[side].teraUsed = true;
        break;
      }

      case 'Fainted': {
        const p = mutPokemon(draft, event.target);
        if (!p) break;
        p.battle.currentHP = 0;
        markFaint(draft, p);
        break;
      }

      case 'BattleEnded': {
        draft.isOver = true;
        draft.winner = event.winner;
        break;
      }
    }

    draft.log.push(stamped);
  });
}

/** Fold a sequence of events from an initial state. */
export function applyEvents(state: BattleState, events: BattleEvent[]): BattleState {
  let cur = state;
  for (const e of events) cur = applyEvent(cur, e);
  return cur;
}

// ---------------------------------------------------------------------------
// Internal helpers (operate on Immer drafts - no immutability ceremony)
// ---------------------------------------------------------------------------

function mutPokemon(draft: BattleState, id: PokemonId): BattlePokemon | null {
  const { side, slot } = parseId(id);
  return draft.sides[side].team[slot] ?? null;
}

/** Switching out clears boosts and most volatiles. */
function resetOnSwitchOut(p: BattlePokemon) {
  p.battle.boosts = {};
  // Volatiles cleared on switch (almost all of them - leaving baton-pass-style
  // ones like substitute / aqua ring for the user to keep manually).
  const persisted: VolatileName[] = ['perish', 'leechSeed']; // perish counts cross switch via Baton Pass only; safer to clear
  const next: typeof p.battle.volatiles = {};
  for (const k of persisted) {
    if (p.battle.volatiles[k]) next[k] = p.battle.volatiles[k];
  }
  p.battle.volatiles = {};
  p.meta.choiceLockedMove = null;
  p.meta.trapped = false;
  p.meta.damageTakenThisTurn = 0;
  p.meta.damageCategoryThisTurn = null;
}

function decrementSide(side: BattleState['sides']['player']) {
  if (side.screens.reflect > 0) side.screens.reflect -= 1;
  if (side.screens.lightScreen > 0) side.screens.lightScreen -= 1;
  if (side.screens.auroraVeil > 0) side.screens.auroraVeil -= 1;
  if (side.tailwind > 0) side.tailwind -= 1;
  if (side.safeguard > 0) side.safeguard -= 1;
  if (side.mist > 0) side.mist -= 1;
}

function decrementField(field: BattleState['field']) {
  if (field.weatherTurns > 0) {
    field.weatherTurns -= 1;
    if (field.weatherTurns === 0) field.weather = '';
  }
  if (field.terrainTurns > 0) {
    field.terrainTurns -= 1;
    if (field.terrainTurns === 0) field.terrain = '';
  }
  if (field.trickRoomTurns > 0) {
    field.trickRoomTurns -= 1;
    if (field.trickRoomTurns === 0) field.isTrickRoom = false;
  }
  if (field.magicRoomTurns > 0) {
    field.magicRoomTurns -= 1;
    if (field.magicRoomTurns === 0) field.isMagicRoom = false;
  }
  if (field.wonderRoomTurns > 0) {
    field.wonderRoomTurns -= 1;
    if (field.wonderRoomTurns === 0) field.isWonderRoom = false;
  }
  if (field.gravityTurns > 0) {
    field.gravityTurns -= 1;
    if (field.gravityTurns === 0) field.isGravity = false;
  }
}

function markFaint(draft: BattleState, p: BattlePokemon) {
  p.battle.status = null;
  p.battle.volatiles = {};
  p.battle.boosts = {};
  const { side, slot } = parseId(p.id);
  // If the fainted Pokémon was the active one and there's still a teammate
  // alive, leave the activeSlot pointer where it is - the user records the
  // SwitchedEvent next. If nobody is alive, mark the battle over.
  const otherSide: SideId = side === 'player' ? 'opponent' : 'player';
  if (aliveCount(draft.sides[side]) === 0) {
    draft.isOver = true;
    draft.winner = otherSide;
  } else if (slot === draft.activeSlot[side]) {
    // Optional courtesy: auto-advance to the first alive teammate so reads
    // don't return a fainted pokemon as "active" before the user manually
    // sends one in.
    const next = findFirstAliveSlot(draft.sides[side]);
    if (next >= 0) draft.activeSlot[side] = next;
  }
}
