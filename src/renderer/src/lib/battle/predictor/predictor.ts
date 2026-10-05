/**
 * Set predictor.
 *
 * Maintains a posterior `P(set | observations)` over a finite candidate pool
 * per opponent Pokémon. Each observation (move used, item revealed, damage
 * dealt, ...) filters or reweights the candidate list via Bayes' rule.
 *
 * The reducer (`events.ts`) stays pure and predictor-agnostic; this module is
 * called on top of it through `runPredictorOnEvent`. Together they form
 * `applyEventAndPredict` exported below.
 */

import { produce } from 'immer';
import type { BattleEvent } from '../events';
import { applyEvent } from '../events';
import type {
  BattlePokemon,
  BattleState,
  PokemonId,
  PredictedSet,
  PredictorEvidence,
  SideId,
} from '../state';
import { parseId } from '../state';
import { calcDamage, type DamageOutcome } from '../damage';
import type { BattlePokemonSpec, FieldSpec } from '../types';
import { toFieldSpec, toSpec } from '../stateBridge';
import { generateCandidateSets } from './setGenerator';
import type { CandidateSet, OpponentModel, PredictorContext } from './types';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Build an initial OpponentModel for a revealed opponent. Candidates come
 * either from a custom pool (usage-based sets) or the generator.
 */
export function initOpponentModel(speciesName: string, level: number, ctx: PredictorContext): OpponentModel {
  const species = ctx.pokemonByName[speciesName.toLowerCase()];
  if (!species) {
    return { candidates: [], confidence: 0, evidence: [emptyEvidence('species not in dex')] };
  }
  const candidates = generateCandidateSets(species, ctx);
  const total = candidates.reduce((a, s) => a + s.prior, 0) || 1;
  const initial: PredictedSet[] = candidates.map((c) => ({
    id: c.id,
    label: c.label,
    nature: c.nature,
    ability: c.ability,
    item: c.item,
    teraType: c.teraType,
    ivs: c.ivs,
    evs: c.evs,
    moves: c.moves,
    weight: c.prior / total,
    eliminated: false,
  }));
  return {
    candidates: initial,
    confidence: confidenceOf(initial),
    evidence: [
      {
        ts: Date.now(),
        observation: `revealed ${speciesName} L${level}`,
        effect: `seeded ${initial.length} candidate set${initial.length === 1 ? '' : 's'}`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Top-level wrapper: applyEvent + then re-run predictor on the changed slot
// ---------------------------------------------------------------------------

/**
 * Apply an event then run the predictor for the affected opponent slot(s).
 * The predictor is a strict superset of `applyEvent` - calling code that
 * doesn't care about uncertainty (e.g. the search engine's chance node
 * branches) can keep using `applyEvent` directly to skip the cost.
 */
export function applyEventAndPredict(
  state: BattleState,
  event: BattleEvent,
  ctx: PredictorContext,
): BattleState {
  const next = applyEvent(state, event);
  return runPredictorOnEvent(state, next, event, ctx);
}

/**
 * Update the predictor models in `next` based on the observation contained in
 * `event`. Reads from both `prev` (e.g. to compute observed damage = HP delta)
 * and `next` (post-event state). Returns a new state with the model updated.
 */
export function runPredictorOnEvent(
  prev: BattleState,
  next: BattleState,
  event: BattleEvent,
  ctx: PredictorContext,
): BattleState {
  return produce(next, (draft) => {
    switch (event.type) {
      case 'PokemonRevealed': {
        if (event.side !== 'opponent') break;
        const p = draft.sides.opponent.team[event.slot];
        if (!p) break;
        p.uncertainty = initOpponentModel(p.identity.species, p.identity.level, ctx);
        break;
      }

      case 'MoveUsed': {
        if (parseId(event.actor).side !== 'opponent') break;
        const p = mutPokemon(draft, event.actor);
        if (!p || !p.uncertainty) break;
        p.uncertainty = narrowByMove(p.uncertainty, event.move);
        break;
      }

      case 'AbilityRevealed': {
        if (parseId(event.target).side !== 'opponent') break;
        const p = mutPokemon(draft, event.target);
        if (!p || !p.uncertainty) break;
        p.uncertainty = narrowByAbility(p.uncertainty, event.ability);
        break;
      }

      case 'ItemRevealed': {
        if (parseId(event.target).side !== 'opponent') break;
        const p = mutPokemon(draft, event.target);
        if (!p || !p.uncertainty) break;
        p.uncertainty = narrowByItem(p.uncertainty, event.item);
        break;
      }

      case 'Terastallized': {
        if (parseId(event.target).side !== 'opponent') break;
        const p = mutPokemon(draft, event.target);
        if (!p || !p.uncertainty || !event.teraType) break;
        p.uncertainty = narrowByTera(p.uncertainty, event.teraType);
        break;
      }

      case 'Damaged': {
        if (parseId(event.target).side !== 'player') break; // we only learn from damage *we* take
        if (!event.cause) break; // `cause` doubles as the move name for inversion
        const oppSlot = next.activeSlot.opponent;
        const attacker = draft.sides.opponent.team[oppSlot];
        const defender = mutPokemon(draft, event.target);
        if (!attacker || !defender || !attacker.uncertainty) break;
        attacker.uncertainty = narrowByDamageInState(
          attacker.uncertainty,
          attacker,
          defender,
          event.cause,
          event.amount,
          prev,
        );
        break;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Narrowing operations - each returns a new OpponentModel
// ---------------------------------------------------------------------------

export function narrowByMove(model: OpponentModel, moveName: string): OpponentModel {
  const m = toId(moveName);
  return reweight(
    model,
    (c) => c.moves.some((mv) => toId(mv) === m),
    {
      observation: `used ${moveName}`,
      eliminatedReason: `does not have ${moveName}`,
    },
  );
}

export function narrowByAbility(model: OpponentModel, ability: string): OpponentModel {
  return reweight(
    model,
    (c) => toId(c.ability) === toId(ability),
    {
      observation: `ability revealed: ${ability}`,
      eliminatedReason: `ability mismatch`,
    },
  );
}

export function narrowByItem(model: OpponentModel, item: string): OpponentModel {
  return reweight(
    model,
    (c) => toId(c.item ?? '') === toId(item),
    {
      observation: `item revealed: ${item}`,
      eliminatedReason: `item mismatch`,
    },
  );
}

export function narrowByTera(model: OpponentModel, teraType: string): OpponentModel {
  return reweight(
    model,
    (c) => toId(c.teraType ?? '') === toId(teraType),
    {
      observation: `terastallized: ${teraType}`,
      eliminatedReason: `tera type mismatch`,
    },
  );
}

/** Damage a move was seen to deal, as shown in the battle. */
export interface ObservedDamage {
  /** In HP (`unit: 'hp'`) or percent of the target's max HP (`unit: 'pct'`). */
  amount: number;
  unit: 'hp' | 'pct';
  /** Allowed error either side, for HP shown as a rounded percentage. */
  tolerance?: number;
  /** The target fainted or hung on at 1 HP, so the move could have done more. */
  atLeast?: boolean;
}

/**
 * Reweight candidates by how well each explains the damage one hit dealt.
 * `outcomeFor` runs the calc for a candidate as the attacker, or returns
 * null when the calc can't judge it. Candidates
 * whose whole roll range misses the observation are eliminated; inside the
 * range the likelihood peaks at the midpoint and halves at the edges.
 */
export function narrowByDamage(
  model: OpponentModel,
  moveName: string,
  observed: ObservedDamage,
  outcomeFor: (c: PredictedSet) => DamageOutcome | null,
  targetName: string,
): OpponentModel {
  if (!moveName) return model;
  const tol = observed.tolerance ?? 0;
  const updated: PredictedSet[] = model.candidates.map((c) => {
    if (c.eliminated) return c;
    const outcome = outcomeFor(c);
    if (!outcome || outcome.error || outcome.isZero) return c;
    const low = observed.unit === 'hp' ? outcome.min : outcome.pctMin;
    const high = observed.unit === 'hp' ? outcome.max : outcome.pctMax;
    const range = observed.unit === 'hp' ? `${low}-${high}` : `${low.toFixed(1)}-${high.toFixed(1)}%`;
    const shown = observed.unit === 'hp' ? `${observed.amount}` : `${observed.amount.toFixed(1)}%`;
    const tooLow = high + tol < observed.amount;
    const tooHigh = !observed.atLeast && low - tol > observed.amount;
    if (tooLow || tooHigh) {
      return {
        ...c,
        eliminated: true,
        eliminatedReason: `${moveName} dealt ${shown}, candidate predicts ${range}`,
        weight: 0,
      };
    }
    if (observed.atLeast) return c;
    const mid = (low + high) / 2;
    const spread = Math.max(1, (high - low) / 2);
    const distance = Math.max(0, Math.abs(observed.amount - mid) - tol);
    const likelihood = Math.max(0.5, 1 - 0.5 * (distance / spread));
    return { ...c, weight: c.weight * likelihood };
  });

  const before = model.candidates.filter((c) => !c.eliminated).length;
  const after = updated.filter((c) => !c.eliminated).length;
  const normalized = normalizeWeights(updated);
  const amount = observed.unit === 'hp' ? `${observed.amount} HP` : `${Math.round(observed.amount)}%`;
  const evidence: PredictorEvidence = {
    ts: Date.now(),
    observation: `${moveName} dealt ${observed.atLeast ? 'at least ' : ''}${amount} to ${targetName}`,
    effect:
      before === after
        ? `reweighted ${after} candidate${after === 1 ? '' : 's'} by damage roll`
        : `narrowed ${before} -> ${after} candidates`,
  };
  return {
    candidates: normalized,
    confidence: confidenceOf(normalized),
    evidence: [...model.evidence, evidence],
  };
}

function narrowByDamageInState(
  model: OpponentModel,
  attacker: BattlePokemon,
  defender: BattlePokemon,
  moveName: string,
  observedDamage: number,
  prevState: BattleState,
): OpponentModel {
  const field: FieldSpec = toFieldSpec(prevState, 'opponent');
  const defSpec: BattlePokemonSpec = toSpec(defender);
  return narrowByDamage(
    model,
    moveName,
    { amount: observedDamage, unit: 'hp' },
    (c) => calcDamage(9, candidateToSpec(c, attacker), defSpec, moveName, field),
    defender.identity.species,
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function reweight(
  model: OpponentModel,
  predicate: (c: PredictedSet) => boolean,
  meta: { observation: string; eliminatedReason: string },
): OpponentModel {
  const before = model.candidates.filter((c) => !c.eliminated).length;
  const next = model.candidates.map((c): PredictedSet => {
    if (c.eliminated) return c;
    if (predicate(c)) return c;
    return { ...c, eliminated: true, eliminatedReason: meta.eliminatedReason, weight: 0 };
  });
  const normalized = normalizeWeights(next);
  const after = normalized.filter((c) => !c.eliminated).length;
  const evidence: PredictorEvidence = {
    ts: Date.now(),
    observation: meta.observation,
    effect: before === after ? 'no change' : `narrowed ${before} -> ${after} candidates`,
  };
  return {
    candidates: normalized,
    confidence: confidenceOf(normalized),
    evidence: [...model.evidence, evidence],
  };
}

function normalizeWeights(sets: PredictedSet[]): PredictedSet[] {
  const live = sets.filter((s) => !s.eliminated);
  const sum = live.reduce((a, s) => a + s.weight, 0);
  if (sum <= 0) {
    // Everything was eliminated - fall back to a uniform "anything is possible"
    // distribution so the search engine doesn't divide by zero.
    return sets.map((s) =>
      s.eliminated ? s : { ...s, weight: 1 / Math.max(1, live.length) },
    );
  }
  return sets.map((s) => (s.eliminated ? s : { ...s, weight: s.weight / sum }));
}

function confidenceOf(sets: PredictedSet[]): number {
  const live = sets.filter((s) => !s.eliminated);
  if (live.length <= 1) return 1;
  // Normalized Shannon entropy -> confidence = 1 - H / Hmax.
  const lnN = Math.log(live.length);
  let h = 0;
  for (const s of live) {
    if (s.weight <= 0) continue;
    h -= s.weight * Math.log(s.weight);
  }
  return Math.max(0, Math.min(1, 1 - h / lnN));
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function emptyEvidence(reason: string): PredictorEvidence {
  return { ts: Date.now(), observation: 'init', effect: reason };
}

function mutPokemon(draft: BattleState, id: PokemonId): BattlePokemon | null {
  const { side, slot } = parseId(id);
  return draft.sides[side].team[slot] ?? null;
}

function candidateToSpec(c: PredictedSet, attacker: BattlePokemon): BattlePokemonSpec {
  return {
    speciesName: attacker.identity.species,
    level: attacker.identity.level,
    nature: c.nature,
    ability: c.ability || undefined,
    item: c.item ?? undefined,
    teraType: c.teraType ?? undefined,
    isTerastallized: attacker.battle.isTerastallized,
    ivs: c.ivs,
    evs: c.evs,
    moves: c.moves.map((m) => ({ name: m })),
    currentHPPercent: 100, // attacker side - we care about output damage, not their KO chance
    status: attacker.battle.status ?? undefined,
    boosts: attacker.battle.boosts,
  };
}

// ---------------------------------------------------------------------------
// Public read helpers for UI
// ---------------------------------------------------------------------------

export function topCandidates(model: OpponentModel, k = 3): PredictedSet[] {
  return [...model.candidates]
    .filter((c) => !c.eliminated)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, k);
}

export function eliminatedCandidates(model: OpponentModel): PredictedSet[] {
  return model.candidates.filter((c) => c.eliminated);
}

// Re-export for the bridge module's typings.
export type { CandidateSet, OpponentModel, PredictorContext, SideId };
