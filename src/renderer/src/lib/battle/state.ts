/**
 * Full immutable BattleState.
 *
 * Design principles:
 *   - Every field can change turn-to-turn; structural sharing is preserved by
 *     using Immer's `produce` in the reducer (see `events.ts`).
 *   - State is what *has* happened (not what *might* happen). Forking is the
 *     search engine's job.
 *   - Hidden information (opponent set) is represented as `KNOWN | INFERRED |
 *     DEFAULT` source on each field, with the predictor populating
 *     the inferred values.
 */

import type { BaseStats, StatKey } from '../types';
import type { Terrain, Weather } from './types';
import type { PredictedSet, PredictorEvidence } from './predictor/types';

export type { PredictedSet, PredictorEvidence };

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

/** Stable per-side, per-slot identifier. Format: "p:0" .. "p:5" or "o:0" .. "o:5". */
export type PokemonId = `${'p' | 'o'}:${0 | 1 | 2 | 3 | 4 | 5}`;

export type SideId = 'player' | 'opponent';

export function makeId(side: SideId, slot: number): PokemonId {
  return `${side === 'player' ? 'p' : 'o'}:${slot}` as PokemonId;
}
export function parseId(id: PokemonId): { side: SideId; slot: number } {
  const [s, n] = id.split(':');
  return { side: s === 'p' ? 'player' : 'opponent', slot: Number(n) };
}

// ---------------------------------------------------------------------------
// Hidden-info provenance
// ---------------------------------------------------------------------------

/** Where this value came from - used to decide whether the predictor can revise. */
export type Source = 'KNOWN' | 'INFERRED' | 'DEFAULT';

/** A value wrapped with its provenance. */
export interface Tagged<T> {
  value: T;
  source: Source;
}

export function known<T>(value: T): Tagged<T> {
  return { value, source: 'KNOWN' };
}
export function inferred<T>(value: T): Tagged<T> {
  return { value, source: 'INFERRED' };
}
export function defaulted<T>(value: T): Tagged<T> {
  return { value, source: 'DEFAULT' };
}

// ---------------------------------------------------------------------------
// Per-Pokémon state
// ---------------------------------------------------------------------------

export type StatusCondition = 'brn' | 'psn' | 'tox' | 'par' | 'slp' | 'frz' | null;

export type VolatileName =
  | 'confusion'
  | 'leechSeed'
  | 'substitute'
  | 'perish'
  | 'encore'
  | 'taunt'
  | 'disable'
  | 'yawn'
  | 'embargo'
  | 'healBlock'
  | 'magnetRise'
  | 'telekinesis'
  | 'aquaRing'
  | 'ingrain'
  | 'foresight'
  | 'miracleEye'
  | 'gastroAcid'
  | 'trapped'
  | 'focused'
  | 'charged'
  | 'defenseCurl'
  | 'minimize'
  | 'protect'
  | 'sub'
  | 'flashFire';

export interface VolatileData {
  /** Remaining turns; 0 = no countdown / persistent until cured. */
  turns: number;
  /** Optional payload: substitute HP, encore move id, perish count, trapper id, etc. */
  data?: number | string;
}

export type BoostsTable = Partial<Record<StatKey | 'acc' | 'eva', number>>;

export type Gender = 'M' | 'F' | 'N';

export interface PokemonIdentity {
  species: string; // canonical display name, e.g. "Garchomp"
  form?: string;
  level: number;
  gender: Gender;
  shiny: boolean;
  isOpponent: boolean;
}

export interface MoveSlotState {
  name: string;
  ppCurrent: number;
  ppMax: number;
  source: Source;
}

export interface KnownSet {
  nature: string;
  ability: Tagged<string | null>;
  item: Tagged<string | null>;
  teraType: Tagged<string | null>;
  ivs: BaseStats;
  evs: BaseStats;
  moves: MoveSlotState[];
}

export interface PokemonBattleState {
  currentHP: number;
  maxHP: number;
  status: StatusCondition;
  /** Sleep counter, TOX counter, etc. */
  statusTurns: number;
  volatiles: Partial<Record<VolatileName, VolatileData>>;
  boosts: BoostsTable;
  isTerastallized: boolean;
  isMega: boolean;
  isDynamaxed: boolean;
  dynamaxTurns: number;
  lastMoveUsed: string | null;
  /** True once the Pokémon has been seen by the opponent (revealed). */
  hasBeenSeen: boolean;
}

export interface PokemonMeta {
  timesHit: number;
  switchInsCount: number;
  damageTakenThisTurn: number;
  damageCategoryThisTurn: 'Physical' | 'Special' | null;
  itemConsumed: boolean;
  abilityChanged: boolean;
  trapped: boolean;
  choiceLockedMove: string | null;
}

export interface BattlePokemon {
  id: PokemonId;
  identity: PokemonIdentity;
  set: KnownSet;
  battle: PokemonBattleState;
  meta: PokemonMeta;
  /**
   * Set predictor output. `null` for the player's own Pokémon
   * (we know our own set); populated for opponent slots after reveal.
   * Carrying the predictor's `OpponentModel` shape directly would create a
   * cycle, so we model the shape inline.
   */
  uncertainty: PokemonUncertainty | null;
}

/** Inline mirror of `predictor/types.ts` `OpponentModel` to avoid circular imports. */
export interface PokemonUncertainty {
  candidates: PredictedSet[];
  /** 1 - normalizedEntropy: 0 = uniform across all candidates, 1 = single set locked in. */
  confidence: number;
  /** Append-only trail of observations and their effect on the distribution. */
  evidence: PredictorEvidence[];
}

// ---------------------------------------------------------------------------
// Per-side state
// ---------------------------------------------------------------------------

export interface SideHazards {
  stealthRock: boolean;
  spikes: 0 | 1 | 2 | 3;
  toxicSpikes: 0 | 1 | 2;
  stickyWeb: boolean;
  steelsurge: boolean;
}

export interface SideScreens {
  reflect: number; // turns remaining; 0 = inactive
  lightScreen: number;
  auroraVeil: number;
}

export interface WishPayload {
  pendingFor: number; // turn when it resolves
  amount: number; // raw HP healed
}
export interface FutureSightPayload {
  resolvesOn: number;
  source: PokemonId;
  damage: number;
}

export interface SideState {
  /** Up to 6 slots; null = empty (unrevealed opponent slots stay null). */
  team: (BattlePokemon | null)[];
  hazards: SideHazards;
  screens: SideScreens;
  tailwind: number;
  safeguard: number;
  mist: number;
  wish: WishPayload | null;
  futureSight: FutureSightPayload | null;
  /** For choice / wish prediction. */
  wishUserHistory: PokemonId[];
  megaUsed: boolean;
  dynamaxUsed: boolean;
  teraUsed: boolean;
}

// ---------------------------------------------------------------------------
// Field state
// ---------------------------------------------------------------------------

export interface FieldState {
  weather: Weather;
  /** Remaining weather turns; 0 = permanent (Primordial / Desolate). */
  weatherTurns: number;
  terrain: Terrain;
  terrainTurns: number;
  isTrickRoom: boolean;
  trickRoomTurns: number;
  isMagicRoom: boolean;
  magicRoomTurns: number;
  isWonderRoom: boolean;
  wonderRoomTurns: number;
  isGravity: boolean;
  gravityTurns: number;
}

export const EMPTY_FIELD_STATE: FieldState = {
  weather: '',
  weatherTurns: 0,
  terrain: '',
  terrainTurns: 0,
  isTrickRoom: false,
  trickRoomTurns: 0,
  isMagicRoom: false,
  magicRoomTurns: 0,
  isWonderRoom: false,
  wonderRoomTurns: 0,
  isGravity: false,
  gravityTurns: 0,
};

// ---------------------------------------------------------------------------
// Battle root
// ---------------------------------------------------------------------------

export interface BattleFormat {
  generation: 9;
  /** Free-form, e.g. "singles", "vgc". */
  tier: string;
  rules: string[];
}

export interface BattleState {
  turn: number;
  format: BattleFormat;
  field: FieldState;
  sides: {
    player: SideState;
    opponent: SideState;
  };
  /** Slot index into the corresponding side's team. */
  activeSlot: {
    player: number;
    opponent: number;
  };
  /** Append-only event history (see events.ts). */
  log: import('./events').BattleEvent[];
  /** For reproducibility when the search engine forks chance nodes. */
  rngSeed: number;
  /** True once at least one side has fainted to fewer than 1 active Pokémon. */
  isOver: boolean;
  /** 'player' | 'opponent' | null. Null while ongoing or tied. */
  winner: SideId | null;
}

// ---------------------------------------------------------------------------
// Constructors / defaults
// ---------------------------------------------------------------------------

export const NEUTRAL_IVS_FULL: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const ZERO_EVS_FULL: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function emptySideState(): SideState {
  return {
    team: [null, null, null, null, null, null],
    hazards: { stealthRock: false, spikes: 0, toxicSpikes: 0, stickyWeb: false, steelsurge: false },
    screens: { reflect: 0, lightScreen: 0, auroraVeil: 0 },
    tailwind: 0,
    safeguard: 0,
    mist: 0,
    wish: null,
    futureSight: null,
    wishUserHistory: [],
    megaUsed: false,
    dynamaxUsed: false,
    teraUsed: false,
  };
}

export function emptyBoosts(): BoostsTable {
  return {};
}

export function emptyBattleState(format: BattleFormat = { generation: 9, tier: 'singles', rules: [] }): BattleState {
  return {
    turn: 0,
    format,
    field: { ...EMPTY_FIELD_STATE },
    sides: { player: emptySideState(), opponent: emptySideState() },
    activeSlot: { player: 0, opponent: 0 },
    log: [],
    rngSeed: 0,
    isOver: false,
    winner: null,
  };
}

// ---------------------------------------------------------------------------
// Read-side helpers
// ---------------------------------------------------------------------------

export function getActive(state: BattleState, side: SideId): BattlePokemon | null {
  return state.sides[side].team[state.activeSlot[side]] ?? null;
}

export function getPokemon(state: BattleState, id: PokemonId): BattlePokemon | null {
  const { side, slot } = parseId(id);
  return state.sides[side].team[slot] ?? null;
}

export function findFirstAliveSlot(side: SideState): number {
  for (let i = 0; i < side.team.length; i++) {
    const p = side.team[i];
    if (p && p.battle.currentHP > 0) return i;
  }
  return -1;
}

export function isFainted(p: BattlePokemon | null): boolean {
  return !p || p.battle.currentHP <= 0;
}

export function aliveCount(side: SideState): number {
  let n = 0;
  for (const p of side.team) if (p && p.battle.currentHP > 0) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Stat math - maxHP and effective stats (used by the reducer + damage bridge)
// ---------------------------------------------------------------------------

import { calcAllStats } from '../stats';
import type { Pokemon } from '../types';

/**
 * Compute maxHP for a Pokémon given its set and species base stats.
 * Shedinja gets the canonical 1 HP, matching `stats.ts`.
 */
export function maxHPFor(species: Pokemon, set: KnownSet, level: number): number {
  const stats = calcAllStats(species.baseStats, set.ivs, set.evs, level, set.nature);
  return stats.hp;
}

// ---------------------------------------------------------------------------
// Pokémon constructor - turn a saved set / paste into a BattlePokemon
// ---------------------------------------------------------------------------

export interface PokemonSetInput {
  speciesName: string;
  level?: number;
  nature?: string;
  ability?: string | null;
  item?: string | null;
  teraType?: string | null;
  ivs?: Partial<BaseStats>;
  evs?: Partial<BaseStats>;
  moves?: { name: string; ppMax?: number; ppCurrent?: number }[];
  gender?: Gender;
  shiny?: boolean;
}

export function makePokemon(
  species: Pokemon,
  input: PokemonSetInput,
  id: PokemonId,
  opts: { isOpponent: boolean; source?: Source } = { isOpponent: false },
): BattlePokemon {
  const source = opts.source ?? (opts.isOpponent ? 'DEFAULT' : 'KNOWN');
  const level = input.level ?? 50;
  const ivs: BaseStats = { ...NEUTRAL_IVS_FULL, ...input.ivs };
  const evs: BaseStats = { ...ZERO_EVS_FULL, ...input.evs };
  const set: KnownSet = {
    nature: input.nature ?? 'Hardy',
    ability: { value: input.ability ?? null, source },
    item: { value: input.item ?? null, source },
    teraType: { value: input.teraType ?? null, source },
    ivs,
    evs,
    moves: (input.moves ?? []).slice(0, 4).map((m) => ({
      name: m.name,
      ppMax: m.ppMax ?? 16,
      ppCurrent: m.ppCurrent ?? m.ppMax ?? 16,
      source,
    })),
  };
  const maxHP = maxHPFor(species, set, level);
  return {
    id,
    identity: {
      species: species.name,
      level,
      gender: input.gender ?? 'N',
      shiny: input.shiny ?? false,
      isOpponent: opts.isOpponent,
    },
    set,
    battle: {
      currentHP: maxHP,
      maxHP,
      status: null,
      statusTurns: 0,
      volatiles: {},
      boosts: emptyBoosts(),
      isTerastallized: false,
      isMega: false,
      isDynamaxed: false,
      dynamaxTurns: 0,
      lastMoveUsed: null,
      hasBeenSeen: false,
    },
    meta: {
      timesHit: 0,
      switchInsCount: 0,
      damageTakenThisTurn: 0,
      damageCategoryThisTurn: null,
      itemConsumed: false,
      abilityChanged: false,
      trapped: false,
      choiceLockedMove: null,
    },
    uncertainty: null,
  };
}
