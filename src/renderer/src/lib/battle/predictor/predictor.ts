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

import type { DamageOutcome } from '../damage';
import { generateCandidateSets } from './setGenerator';
import type { CandidateSet, OpponentModel, PredictedSet, PredictorContext, PredictorEvidence } from './types';

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
    (c) => c.item == null || toId(c.item) === toId(item),
    {
      observation: `item revealed: ${item}`,
      eliminatedReason: `item mismatch`,
    },
  );
}

export function narrowByTera(model: OpponentModel, teraType: string): OpponentModel {
  return reweight(
    model,
    (c) => c.teraType == null || toId(c.teraType) === toId(teraType),
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

export type { CandidateSet, OpponentModel, PredictorContext };
