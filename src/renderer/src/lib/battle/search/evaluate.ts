/**
 * Evaluation Function.
 *
 * Maps a `BattleState` to a scalar utility from the *player's* perspective.
 * Weights are hand-tuned.
 *
 * The eval is the leaf value of the search tree, so it has to summarize
 * everything below the horizon. The feature set stays small and explainable:
 * a too-clever eval is hard to debug when the engine picks a bad move.
 */

import type { BattleState, BattlePokemon, SideId } from '../state';
import { aliveCount } from '../state';
import type { EvalBreakdown } from './types';

const WEIGHTS = {
  hp: 1.0,
  count: 5.0,
  status: 0.6,
  boost: 0.5,
  hazard: 0.4,
  screens: 0.2,
  tempo: 0.3,
} as const;

export function evaluate(state: BattleState): EvalBreakdown {
  const hp = hpScore(state);
  const count = countScore(state);
  const status = statusScore(state);
  const boost = boostScore(state);
  const hazard = hazardScore(state);
  const screens = screensScore(state);
  const tempo = tempoScore(state);

  // Terminal states dominate.
  if (state.isOver) {
    const winnerBonus = state.winner === 'player' ? 100 : state.winner === 'opponent' ? -100 : 0;
    return {
      total: winnerBonus + WEIGHTS.hp * hp + WEIGHTS.count * count,
      hp, count, status, boost, hazard, screens, tempo,
    };
  }

  const total =
    WEIGHTS.hp * hp +
    WEIGHTS.count * count +
    WEIGHTS.status * status +
    WEIGHTS.boost * boost +
    WEIGHTS.hazard * hazard +
    WEIGHTS.screens * screens +
    WEIGHTS.tempo * tempo;

  return { total, hp, count, status, boost, hazard, screens, tempo };
}

// ---------------------------------------------------------------------------
// Feature helpers
// ---------------------------------------------------------------------------

function hpScore(state: BattleState): number {
  return sideHP(state, 'player') - sideHP(state, 'opponent');
}

function sideHP(state: BattleState, side: SideId): number {
  let s = 0;
  for (const p of state.sides[side].team) {
    if (!p) continue;
    if (p.battle.maxHP > 0) s += p.battle.currentHP / p.battle.maxHP;
  }
  return s;
}

function countScore(state: BattleState): number {
  return aliveCount(state.sides.player) - aliveCount(state.sides.opponent);
}

function statusScore(state: BattleState): number {
  return -statusBurden(state, 'player') + statusBurden(state, 'opponent');
}

function statusBurden(state: BattleState, side: SideId): number {
  let n = 0;
  for (const p of state.sides[side].team) {
    if (!p || p.battle.currentHP <= 0) continue;
    const s = p.battle.status;
    if (!s) continue;
    // Burns are worst on physical attackers; we approximate burden by the
    // Pokémon's higher offensive stat. Sleep / freeze are flat heavy taxes.
    const physThreat = p.set.evs.atk >= p.set.evs.spa;
    switch (s) {
      case 'brn':
        n += physThreat ? 0.8 : 0.3;
        break;
      case 'par':
        n += 0.6;
        break;
      case 'tox':
        n += 0.7;
        break;
      case 'psn':
        n += 0.4;
        break;
      case 'slp':
        n += 1.0;
        break;
      case 'frz':
        n += 1.0;
        break;
    }
  }
  return n;
}

function boostScore(state: BattleState): number {
  return sideBoost(state, 'player') - sideBoost(state, 'opponent');
}

function sideBoost(state: BattleState, side: SideId): number {
  const p = state.sides[side].team[state.activeSlot[side]];
  if (!p || p.battle.currentHP <= 0) return 0;
  let n = 0;
  // Positive offensive boosts on the active are worth the most.
  const atk = p.battle.boosts.atk ?? 0;
  const spa = p.battle.boosts.spa ?? 0;
  const spe = p.battle.boosts.spe ?? 0;
  const def = p.battle.boosts.def ?? 0;
  const spd = p.battle.boosts.spd ?? 0;
  // +1 attack ~ 50% damage gain, but utility caps at +2/+3 in practice
  n += Math.tanh(atk / 2) * 1.0;
  n += Math.tanh(spa / 2) * 1.0;
  n += Math.tanh(spe / 2) * 0.6;
  n += Math.tanh(def / 2) * 0.4;
  n += Math.tanh(spd / 2) * 0.4;
  return n;
}

function hazardScore(state: BattleState): number {
  return -sideHazardWeight(state, 'player') + sideHazardWeight(state, 'opponent');
}

function sideHazardWeight(state: BattleState, side: SideId): number {
  const h = state.sides[side].hazards;
  let n = 0;
  if (h.stealthRock) n += 0.4;
  n += h.spikes * 0.25;
  n += h.toxicSpikes * 0.3;
  if (h.stickyWeb) n += 0.2;
  if (h.steelsurge) n += 0.4;
  // Scale by how many of that side's team are still alive (more victims = more value).
  n *= Math.max(1, aliveCount(state.sides[side])) / 6;
  return n;
}

function screensScore(state: BattleState): number {
  return sideScreens(state, 'player') - sideScreens(state, 'opponent');
}

function sideScreens(state: BattleState, side: SideId): number {
  const s = state.sides[side].screens;
  return (s.reflect > 0 ? 0.2 : 0) + (s.lightScreen > 0 ? 0.2 : 0) + (s.auroraVeil > 0 ? 0.3 : 0);
}

function tempoScore(state: BattleState): number {
  // Tailwind, terrain-friendly active, weather-friendly ability - quick wins
  // not captured by HP/count.
  let n = 0;
  if (state.sides.player.tailwind > 0) n += 0.4;
  if (state.sides.opponent.tailwind > 0) n -= 0.4;
  // A weather/terrain that our active benefits from is loosely +0.2; we don't
  // try to be clever here because the eval would tangent into ability theory.
  return n;
}

// Exposed for unit tests so they can probe individual features.
export const __test_only__ = {
  hpScore, countScore, statusScore, boostScore, hazardScore, screensScore, tempoScore,
};

// Re-export to silence the unused-import warning in TS environments that flag it.
export type { BattlePokemon };
