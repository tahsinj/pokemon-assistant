/**
 * Set predictor.
 *
 * Maintains a posterior `P(set | observations)` over a finite candidate pool
 * per opponent Pokémon. Each observation (move used, item revealed, damage
 * dealt, …) filters or reweights the candidate list via Bayes' rule.
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
import { calcDamage } from '../damage';
import type { BattlePokemonSpec, FieldSpec } from '../types';
import { toFieldSpec, toSpec } from '../stateBridge';
import { generateCandidateSets } from './setGenerator';
import type { CandidateSet, OpponentModel, PredictorContext } from './types';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Build an initial OpponentModel for a revealed opponent. Candidates come
 * either from a custom pool (Cobblemon trainer sets) or the generator.
 */
export function initOpponentModel(
  pokemon: BattlePokemon,
  ctx: PredictorContext,
): OpponentModel {
  const species = ctx.pokemonByName[pokemon.identity.species.toLowerCase()];
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
        observation: `revealed ${pokemon.identity.species} L${pokemon.identity.level}`,
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
        p.uncertainty = initOpponentModel(p, ctx);
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
        attacker.uncertainty = narrowByDamage(
          attacker.uncertainty,
          attacker,
          defender,
          event.cause,
          event.amount,
          prev,
          ctx,
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
  const m = moveName.toLowerCase();
  return reweight(
    model,
    (c) => c.moves.some((mv) => mv.toLowerCase() === m),
    {
      observation: `used ${moveName}`,
      eliminatedReason: `does not have ${moveName}`,
    },
  );
}

export function narrowByAbility(model: OpponentModel, ability: string): OpponentModel {
  return reweight(
    model,
    (c) => c.ability.toLowerCase() === ability.toLowerCase(),
    {
      observation: `ability revealed: ${ability}`,
      eliminatedReason: `ability mismatch`,
    },
  );
}

export function narrowByItem(model: OpponentModel, item: string): OpponentModel {
  return reweight(
    model,
    (c) => (c.item ?? '').toLowerCase() === item.toLowerCase(),
    {
      observation: `item revealed: ${item}`,
      eliminatedReason: `item mismatch`,
    },
  );
}

export function narrowByTera(model: OpponentModel, teraType: string): OpponentModel {
  return reweight(
    model,
    (c) => (c.teraType ?? '').toLowerCase() === teraType.toLowerCase(),
    {
      observation: `terastallized: ${teraType}`,
      eliminatedReason: `tera type mismatch`,
    },
  );
}

export function narrowByDamage(
  model: OpponentModel,
  attacker: BattlePokemon,
  defender: BattlePokemon,
  moveName: string,
  observedDamage: number,
  prevState: BattleState,
  ctx: PredictorContext,
): OpponentModel {
  if (!moveName) return model;
  const species = ctx.pokemonByName[attacker.identity.species.toLowerCase()];
  if (!species) return model;
  const field: FieldSpec = toFieldSpec(prevState, 'opponent');
  const defSpec: BattlePokemonSpec = toSpec(defender);

  const updated: PredictedSet[] = model.candidates.map((c) => {
    if (c.eliminated) return c;
    const attSpec: BattlePokemonSpec = candidateToSpec(c, attacker);
    const outcome = calcDamage(9, attSpec, defSpec, moveName, field);
    if (outcome.error || outcome.isZero) return c;
    const low = outcome.min;
    const high = outcome.max;
    if (observedDamage < low || observedDamage > high) {
      return {
        ...c,
        eliminated: true,
        eliminatedReason: `${moveName} dealt ${observedDamage}, candidate predicts ${low}-${high}`,
        weight: 0,
      };
    }
    // Soft likelihood inside the range: peak weight at the midpoint, half at edges.
    const mid = (low + high) / 2;
    const spread = Math.max(1, (high - low) / 2);
    const distance = Math.abs(observedDamage - mid);
    const likelihood = Math.max(0.5, 1 - 0.5 * (distance / spread));
    return { ...c, weight: c.weight * likelihood };
  });

  const before = model.candidates.filter((c) => !c.eliminated).length;
  const after = updated.filter((c) => !c.eliminated).length;
  const normalized = normalizeWeights(updated);
  const evidence: PredictorEvidence = {
    ts: Date.now(),
    observation: `${moveName} dealt ${observedDamage} HP to ${defender.identity.species}`,
    effect:
      before === after
        ? `reweighted ${after} candidate${after === 1 ? '' : 's'} by damage roll`
        : `narrowed ${before} → ${after} candidates`,
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
    effect: before === after ? 'no change' : `narrowed ${before} → ${after} candidates`,
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
