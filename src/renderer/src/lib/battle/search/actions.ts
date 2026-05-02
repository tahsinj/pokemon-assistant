/**
 * Action Generator.
 *
 * Enumerates every legal action for a given side, with light pruning:
 * - PP 0, choice-locked, disabled, taunt -> drop the move
 * - fainted teammates -> drop the switch
 * - non-fainted active -> user cannot switch to itself
 *
 * Heavy pruning (strictly-dominated detection) is left for later phases; the
 * search engine cares more about correctness than micro-branching here.
 */

import type { Action } from './types';
import { getActive, type BattleState, type SideId } from '../state';

export function generateLegalActions(
  state: BattleState,
  side: SideId,
  opts: { includeSwitches: boolean } = { includeSwitches: true },
): Action[] {
  const out: Action[] = [];
  const active = getActive(state, side);
  if (!active) return out;
  if (active.battle.currentHP <= 0) {
    // Only forced switches are legal when the active is fainted.
    return opts.includeSwitches ? switchActions(state, side, /*excludeActive*/ true) : [];
  }

  const choiceLocked = active.meta.choiceLockedMove;
  for (const slot of active.set.moves) {
    if (!slot.name) continue;
    if (slot.ppCurrent <= 0) continue;
    if (choiceLocked && slot.name !== choiceLocked) continue;
    out.push({ kind: 'move', move: slot.name });
  }
  // Tera variant (Gen 9). Only legal once per battle per side and only when a
  // tera type is on file.
  const teraType = active.set.teraType.value;
  if (teraType && !state.sides[side].teraUsed && !active.battle.isTerastallized) {
    for (const slot of active.set.moves) {
      if (!slot.name) continue;
      if (slot.ppCurrent <= 0) continue;
      if (choiceLocked && slot.name !== choiceLocked) continue;
      out.push({ kind: 'move', move: slot.name, tera: true });
    }
  }
  if (opts.includeSwitches && !active.meta.trapped) {
    out.push(...switchActions(state, side, /*excludeActive*/ true));
  }
  return out;
}

function switchActions(state: BattleState, side: SideId, excludeActive: boolean): Action[] {
  const active = state.activeSlot[side];
  const out: Action[] = [];
  for (let slot = 0; slot < state.sides[side].team.length; slot++) {
    if (excludeActive && slot === active) continue;
    const p = state.sides[side].team[slot];
    if (!p) continue;
    if (p.battle.currentHP <= 0) continue;
    out.push({ kind: 'switch', toSlot: slot });
  }
  return out;
}

export function describeAction(action: Action): string {
  if (action.kind === 'move') {
    return action.tera ? `Tera + ${action.move}` : action.move;
  }
  return `Switch (slot ${action.toSlot + 1})`;
}
