/**
 * Turn Simulator. Given the current state plus one action per side, produce
 * the post-turn state. This is deterministic: chance nodes (damage rolls,
 * crit, secondary effect procs) collapse to expected values.
 *
 * The simulator runs only on the reducer (no predictor) since search chance
 * branches don't need uncertainty updates - they read frozen opponent sets
 * passed in by the search engine.
 */

import { applyEvent, type BattleEvent } from '../events';
import { calcDamage, type DamageOutcome } from '../damage';
import { getActive, type BattlePokemon, type BattleState, type PredictedSet, type SideId } from '../state';
import { toFieldSpec, toSpec } from '../stateBridge';
import { resolveTurnOrder, type SpeedContext } from './speed';
import type { Action } from './types';
import type { BaseStats, Move } from '../../types';

export interface SimContext extends SpeedContext {
  speciesLookup: (name: string) => { baseStats: BaseStats } | undefined;
  moves: Record<string, Move>;
}

/**
 * Apply one turn pair.
 * @param state - current battle state
 * @param playerAction - what the player chooses
 * @param opponentAction - what the opponent chooses
 * @param oppOverrideSet - when present, temporarily reinterprets the
 *   opponent's active using this candidate set (used by the search engine to
 *   marginalize over predictor hypotheses).
 */
export function simulateTurn(
  state: BattleState,
  playerAction: Action,
  opponentAction: Action,
  ctx: SimContext,
  oppOverrideSet?: PredictedSet,
): BattleState {
  // Hypothesize an opponent set for this branch.
  const projected = oppOverrideSet ? withOpponentSet(state, oppOverrideSet) : state;

  // Resolve switches first (they always go before moves).
  let next = projected;
  if (playerAction.kind === 'switch') {
    next = applyEvent(next, { type: 'Switched', side: 'player', toSlot: playerAction.toSlot });
  }
  if (opponentAction.kind === 'switch') {
    next = applyEvent(next, { type: 'Switched', side: 'opponent', toSlot: opponentAction.toSlot });
  }

  if (playerAction.kind === 'switch' && opponentAction.kind === 'switch') {
    return endOfTurn(next);
  }

  // If only one side moves, that side acts unopposed.
  if (playerAction.kind === 'switch' && opponentAction.kind === 'move') {
    next = applyMove(next, 'opponent', opponentAction, ctx);
    return endOfTurn(next);
  }
  if (opponentAction.kind === 'switch' && playerAction.kind === 'move') {
    next = applyMove(next, 'player', playerAction, ctx);
    return endOfTurn(next);
  }

  // Both sides selected a move - resolve order, then act.
  const order = resolveTurnOrder(next, playerAction, opponentAction, ctx, ctx.speciesLookup);
  // Tied -> assume player wins the tie (deterministic; a fuller model would use
  // explicit 50/50 branching).
  const playerFirst = order !== 'opponent-first';
  // A fainted Pokémon's queued action is lost - even if the reducer auto-
  // promotes a replacement, the replacement must not inherit the move. So the
  // second actor only moves if it is still the same Pokémon that chose it.
  const playerId = getActive(next, 'player')?.id;
  const opponentId = getActive(next, 'opponent')?.id;
  if (playerFirst) {
    next = applyMove(next, 'player', playerAction as Extract<Action, { kind: 'move' }>, ctx);
    const opp = getActive(next, 'opponent');
    if (opp && opp.id === opponentId && opp.battle.currentHP > 0) {
      next = applyMove(next, 'opponent', opponentAction as Extract<Action, { kind: 'move' }>, ctx);
    }
  } else {
    next = applyMove(next, 'opponent', opponentAction as Extract<Action, { kind: 'move' }>, ctx);
    const us = getActive(next, 'player');
    if (us && us.id === playerId && us.battle.currentHP > 0) {
      next = applyMove(next, 'player', playerAction as Extract<Action, { kind: 'move' }>, ctx);
    }
  }
  return endOfTurn(next);
}

/** Tick turn counters; matches the reducer's TurnStarted decrement step. */
function endOfTurn(state: BattleState): BattleState {
  return applyEvent(state, { type: 'TurnStarted', turn: state.turn + 1 });
}

/**
 * Apply a move using expected damage (avg of 16 rolls). Status moves are
 * approximated as no-op + lastMoveUsed update; secondary effects skipped.
 */
function applyMove(
  state: BattleState,
  attackerSide: SideId,
  action: Extract<Action, { kind: 'move' }>,
  ctx: SimContext,
): BattleState {
  const defenderSide: SideId = attackerSide === 'player' ? 'opponent' : 'player';
  const attacker = getActive(state, attackerSide);
  const defender = getActive(state, defenderSide);
  if (!attacker || !defender) return state;
  if (attacker.battle.currentHP <= 0) return state;
  if (defender.battle.currentHP <= 0) return state;

  const targetId = defender.id;
  const events: BattleEvent[] = [
    {
      type: 'MoveUsed',
      actor: attacker.id,
      move: action.move,
      consumePP: true,
    },
  ];
  if (action.tera && !attacker.battle.isTerastallized) {
    events.unshift({
      type: 'Terastallized',
      target: attacker.id,
      teraType: attacker.set.teraType.value ?? undefined,
    });
  }

  // Compute expected damage.
  const atkSpec = toSpec(attacker);
  const defSpec = toSpec(defender);
  const field = toFieldSpec(state, attackerSide);
  let outcome: DamageOutcome | null = null;
  try {
    outcome = calcDamage(9, atkSpec, defSpec, action.move, field);
  } catch {
    outcome = null;
  }
  if (outcome && !outcome.isZero && !outcome.error) {
    const expected = Math.max(1, Math.round(outcome.avgDamage));
    events.push({
      type: 'Damaged',
      target: targetId,
      amount: expected,
      cause: action.move,
      category: outcome.category,
    });
    // Recoil/drain are not surfaced in the current DamageOutcome shape; the
    // wrapper will start emitting those once the damage engine supports them.
  }

  let next = state;
  for (const e of events) next = applyEvent(next, e);
  return next;
}

/**
 * Project the opponent's active using a hypothesized set. We rebuild the
 * `KnownSet` fields from the candidate but preserve the live `battle` slot
 * (current HP, status, boosts, ...) so the simulation reflects in-battle damage.
 */
function withOpponentSet(state: BattleState, candidate: PredictedSet): BattleState {
  const oppSlot = state.activeSlot.opponent;
  const opp = state.sides.opponent.team[oppSlot];
  if (!opp) return state;

  const projected: BattlePokemon = {
    ...opp,
    set: {
      nature: candidate.nature,
      ability: { value: candidate.ability, source: 'INFERRED' },
      item: { value: candidate.item, source: 'INFERRED' },
      teraType: { value: candidate.teraType, source: 'INFERRED' },
      ivs: candidate.ivs,
      evs: candidate.evs,
      // Preserve any revealed moves we already know about, otherwise use the
      // candidate's moves as the operating set.
      moves: opp.set.moves.length
        ? opp.set.moves
        : candidate.moves.map((name) => ({ name, ppCurrent: 16, ppMax: 16, source: 'INFERRED' as const })),
    },
  };
  // Shallow-merge into the state - mutating an `Immer`-frozen tree isn't safe,
  // so produce a fresh `BattleState` instead.
  return {
    ...state,
    sides: {
      player: state.sides.player,
      opponent: {
        ...state.sides.opponent,
        team: state.sides.opponent.team.map((p, i) => (i === oppSlot ? projected : p)),
      },
    },
  };
}

export const __test_only__ = { withOpponentSet };
