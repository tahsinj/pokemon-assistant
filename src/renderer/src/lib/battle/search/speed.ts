/**
 * Speed & Priority Resolver.
 *
 * Combines move priority brackets with effective Speed (boosts, items, status,
 * weather abilities, Tailwind, Trick Room). Returns a deterministic order for
 * a given (player action, opponent action) pair. Speed ties resolve as
 * `'tied'`; callers can branch on this or pick the player as a tie-break.
 */

import { calcAllStats } from '../../stats';
import type { BattlePokemon, BattleState, SideId } from '../state';
import type { BaseStats, Move } from '../../types';
import type { Action } from './types';

export interface SpeedContext {
  /** Lookup of all moves by id (lowercase, no punctuation). */
  moves: Record<string, Move>;
}

const PRIORITY_MAP: Record<string, number> = {
  // Curated priority list; extend as moves are added.
  'helping hand': 5,
  'magic coat': 4,
  snatch: 4,
  detect: 4,
  protect: 4,
  endure: 4,
  'spiky shield': 4,
  'baneful bunker': 4,
  'kings shield': 4,
  obstruct: 4,
  'silk trap': 4,
  'fake out': 3,
  'quick guard': 3,
  'wide guard': 3,
  'extreme speed': 2,
  'first impression': 2,
  feint: 2,
  'ice shard': 1,
  'aqua jet': 1,
  'bullet punch': 1,
  'mach punch': 1,
  'quick attack': 1,
  'shadow sneak': 1,
  'sucker punch': 1,
  'vacuum wave': 1,
  'water shuriken': 1,
  accelerock: 1,
  'jet punch': 1,
  thunderclap: 1,
  pursuit: 0, // (interrupts switch but is +0)
  'vital throw': -1,
  avalanche: -4,
  revenge: -4,
  counter: -5,
  'mirror coat': -5,
  roar: -6,
  whirlwind: -6,
  'circle throw': -6,
  'dragon tail': -6,
  'trick room': -7,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Effective Speed for a Pokémon in the current state. */
export function effectiveSpeed(state: BattleState, side: SideId, p: BattlePokemon, species: { baseStats: BaseStats } | undefined): number {
  const baseStats = species?.baseStats ?? null;
  if (!baseStats) return 0;
  const stats = calcAllStats(baseStats, p.set.ivs, p.set.evs, p.identity.level, p.set.nature);
  let spe = stats.spe;

  const boost = p.battle.boosts.spe ?? 0;
  spe = applyBoost(spe, boost);

  if (p.battle.status === 'par') spe = Math.floor(spe / 2);
  const item = p.set.item.value ?? '';
  if (item === 'Choice Scarf') spe = Math.floor(spe * 1.5);
  if (item === 'Iron Ball' || item === 'Macho Brace' || item === 'Lagging Tail') spe = Math.floor(spe / 2);

  const sideState = state.sides[side];
  if (sideState.tailwind > 0) spe *= 2;

  const ability = p.set.ability.value ?? '';
  const weather = state.field.weather;
  if (ability === 'Swift Swim' && weather === 'Rain') spe *= 2;
  if (ability === 'Chlorophyll' && weather === 'Sun') spe *= 2;
  if (ability === 'Sand Rush' && weather === 'Sand') spe *= 2;
  if (ability === 'Slush Rush' && (weather === 'Snow' || weather === 'Hail')) spe *= 2;
  if (ability === 'Surge Surfer' && state.field.terrain === 'Electric') spe *= 2;
  if (ability === 'Quick Feet' && p.battle.status) spe = Math.floor(spe * 1.5);
  if (ability === 'Unburden' && p.meta.itemConsumed) spe *= 2;
  if (ability === 'Slow Start') spe = Math.floor(spe / 2);

  return Math.floor(spe);
}

function applyBoost(stat: number, boost: number): number {
  if (boost >= 0) return Math.floor((stat * (2 + boost)) / 2);
  return Math.floor((stat * 2) / (2 - boost));
}

/** Move's effective priority, including a few ability/item modifiers. */
export function movePriority(action: Action, p: BattlePokemon, ctx: SpeedContext): number {
  if (action.kind === 'switch') return 6; // switches resolve before all moves
  const key = action.move.toLowerCase();
  const id = key.replace(/[^a-z0-9]/g, '');
  const move = ctx.moves[id];
  let prio = PRIORITY_MAP[key] ?? move?.priority ?? 0;
  const ability = p.set.ability.value ?? '';
  if (ability === 'Prankster' && move?.category === 'Status') prio += 1;
  if (ability === 'Gale Wings' && move?.type === 'flying' && p.battle.currentHP === p.battle.maxHP) prio += 1;
  if (ability === 'Triage' && isHealingMove(id)) prio += 3;
  return prio;
}

function isHealingMove(id: string): boolean {
  return new Set([
    'recover', 'roost', 'slackoff', 'softboiled', 'synthesis', 'moonlight', 'morningsun', 'wish', 'healorder',
    'shoreup', 'drainpunch', 'gigadrain', 'leechlife', 'absorb', 'megadrain', 'paraboliccharge',
  ]).has(id);
}

export type TurnOrder = 'player-first' | 'opponent-first' | 'tied';

/** Determine the order of two side actions in a turn. */
export function resolveTurnOrder(
  state: BattleState,
  playerAction: Action,
  opponentAction: Action,
  ctx: SpeedContext,
  speciesLookup: (name: string) => { baseStats: BaseStats } | undefined,
): TurnOrder {
  const p = state.sides.player.team[state.activeSlot.player];
  const o = state.sides.opponent.team[state.activeSlot.opponent];
  if (!p || !o) return 'tied';

  const pPrio = movePriority(playerAction, p, ctx);
  const oPrio = movePriority(opponentAction, o, ctx);
  if (pPrio !== oPrio) return pPrio > oPrio ? 'player-first' : 'opponent-first';

  const pSpe = effectiveSpeed(state, 'player', p, speciesLookup(p.identity.species));
  const oSpe = effectiveSpeed(state, 'opponent', o, speciesLookup(o.identity.species));
  const trickRoom = state.field.isTrickRoom;
  if (pSpe === oSpe) return 'tied';
  const playerFaster = trickRoom ? pSpe < oSpe : pSpe > oSpe;
  return playerFaster ? 'player-first' : 'opponent-first';
}
