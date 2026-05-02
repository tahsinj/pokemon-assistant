/**
 * Adapter: BattleState (full live-battle model) -> BattlePokemonSpec / FieldSpec
 * (flat calc inputs). The damage engine stays unchanged; this layer
 * just projects the live state into the shape `calcDamage` already accepts.
 */

import { calcAllMoves, calcDamage, type DamageOutcome } from './damage';
import type {
  BattlePokemon,
  BattleState,
  PokemonId,
  SideId,
} from './state';
import { getActive, parseId } from './state';
import {
  EMPTY_FIELD,
  EMPTY_SIDE,
  type BattlePokemonSpec,
  type FieldSpec,
  type Generation,
  type SideSpec,
} from './types';

const GEN: Generation = 9;

/** Project a single BattlePokemon into the flat calc spec. */
export function toSpec(p: BattlePokemon, currentHPPercentOverride?: number): BattlePokemonSpec {
  const pct = currentHPPercentOverride != null
    ? currentHPPercentOverride
    : p.battle.maxHP > 0
      ? Math.round((p.battle.currentHP / p.battle.maxHP) * 100)
      : 100;
  return {
    speciesName: p.identity.species,
    level: p.identity.level,
    nature: p.set.nature,
    ability: p.set.ability.value ?? undefined,
    item: p.set.item.value ?? undefined,
    teraType: p.set.teraType.value ?? undefined,
    isTerastallized: p.battle.isTerastallized,
    ivs: p.set.ivs,
    evs: p.set.evs,
    moves: p.set.moves.map((m) => ({ name: m.name })),
    currentHPPercent: pct,
    status:
      p.battle.status && p.battle.status !== null
        ? (p.battle.status as BattlePokemonSpec['status'])
        : undefined,
    boosts: p.battle.boosts,
  };
}

/**
 * Project the field + relevant sides into a calc FieldSpec.
 *
 * The calc treats "attacker side" / "defender side" as fixed; whichever side
 * the projected attacker belongs to becomes attackerSide. If the attacker is
 * the opponent's active, we flip the sides so screens/hazards apply correctly.
 */
export function toFieldSpec(state: BattleState, attackerSide: SideId): FieldSpec {
  const defenderSide: SideId = attackerSide === 'player' ? 'opponent' : 'player';
  return {
    weather: state.field.weather,
    terrain: state.field.terrain,
    isGravity: state.field.isGravity,
    attackerSide: projectSide(state, attackerSide),
    defenderSide: projectSide(state, defenderSide),
  };
}

function projectSide(state: BattleState, side: SideId): SideSpec {
  const s = state.sides[side];
  return {
    ...EMPTY_SIDE,
    spikes: s.hazards.spikes,
    steelsurge: s.hazards.steelsurge,
    stealthRock: s.hazards.stealthRock,
    isReflect: s.screens.reflect > 0,
    isLightScreen: s.screens.lightScreen > 0,
    isAuroraVeil: s.screens.auroraVeil > 0,
    isTailwind: s.tailwind > 0,
  };
}

/** Convenience: pick an attacker / defender from the state by side, then calc one move. */
export function damageFromState(
  state: BattleState,
  attackerSide: SideId,
  move: string,
): DamageOutcome | null {
  const atk = getActive(state, attackerSide);
  const defSide: SideId = attackerSide === 'player' ? 'opponent' : 'player';
  const def = getActive(state, defSide);
  if (!atk || !def) return null;
  return calcDamage(GEN, toSpec(atk), toSpec(def), move, toFieldSpec(state, attackerSide));
}

/** All moves of `attackerSide`'s active versus the opposing active. */
export function activeMatchupDamage(
  state: BattleState,
  attackerSide: SideId,
): { attacker: BattlePokemon; defender: BattlePokemon; outcomes: DamageOutcome[] } | null {
  const atk = getActive(state, attackerSide);
  const defSide: SideId = attackerSide === 'player' ? 'opponent' : 'player';
  const def = getActive(state, defSide);
  if (!atk || !def) return null;
  return {
    attacker: atk,
    defender: def,
    outcomes: calcAllMoves(GEN, toSpec(atk), toSpec(def), toFieldSpec(state, attackerSide)),
  };
}

/** Per-team-member damage matrix vs the opposing active. */
export function teamDamageVsOpponent(
  state: BattleState,
): { id: PokemonId; pokemon: BattlePokemon; outcomes: DamageOutcome[] }[] {
  const def = getActive(state, 'opponent');
  if (!def) return [];
  const field = toFieldSpec(state, 'player');
  const rows: { id: PokemonId; pokemon: BattlePokemon; outcomes: DamageOutcome[] }[] = [];
  for (const p of state.sides.player.team) {
    if (!p) continue;
    const outcomes = calcAllMoves(GEN, toSpec(p), toSpec(def), field);
    rows.push({ id: p.id, pokemon: p, outcomes });
  }
  return rows;
}

/** Best move (by KO chance, then max %) for a given attacker id vs the opposing active. */
export function bestMoveAgainstOpponent(state: BattleState, attackerId: PokemonId): DamageOutcome | null {
  const { side } = parseId(attackerId);
  const defSide: SideId = side === 'player' ? 'opponent' : 'player';
  const atk = state.sides[side].team[parseId(attackerId).slot];
  const def = getActive(state, defSide);
  if (!atk || !def) return null;
  const outcomes = calcAllMoves(GEN, toSpec(atk), toSpec(def), toFieldSpec(state, side));
  outcomes.sort((a, b) => {
    const ka = a.ko.chance + a.pctMax / 1000;
    const kb = b.ko.chance + b.pctMax / 1000;
    return kb - ka;
  });
  return outcomes[0] ?? null;
}

export const STATE_BRIDGE_DEFAULT_FIELD = EMPTY_FIELD;
