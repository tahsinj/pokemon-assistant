/** Predictor types. Kept free of any battle-state model so both state models can use them. */

import type { BaseStats, Move, Pokemon } from '../../types';

export interface PredictedSet {
  id: string; // e.g. "garchomp:offensive-scarf"
  label: string; // human-readable archetype
  nature: string;
  ability: string;
  /** Null when the set doesn't say; then any revealed item fits it. Same for teraType. */
  item: string | null;
  teraType: string | null;
  ivs: BaseStats;
  evs: BaseStats;
  /** Display names. Usually four; a random battle role lists its whole movepool. */
  moves: string[];
  /** Posterior weight in [0, 1]; sum across non-eliminated candidates = 1. */
  weight: number;
  /** True once an observation contradicted this set. Kept for explanation. */
  eliminated: boolean;
  eliminatedReason?: string;
}

export interface PredictorEvidence {
  ts: number;
  observation: string;
  effect: string;
}

/** A candidate set the generator can produce, before posterior weights. */
export interface CandidateSet {
  id: string;
  label: string;
  nature: string;
  ability: string;
  item: string | null;
  teraType: string | null;
  ivs: BaseStats;
  evs: BaseStats;
  moves: string[];
  /** Prior probability from the generator, before any observations. */
  prior: number;
}

export interface OpponentModel {
  candidates: PredictedSet[];
  confidence: number;
  evidence: PredictorEvidence[];
}

export interface PredictorContext {
  pokemonByName: Record<string, Pokemon>;
  moves: Record<string, Move>;
  /** Optional custom set pool indexed by species id (e.g. usage-based sets). */
  customSetPool?: Record<string, CandidateSet[]>;
}

export type Archetype =
  | 'physical-sweeper'
  | 'special-sweeper'
  | 'physical-scarf'
  | 'special-scarf'
  | 'physical-band'
  | 'special-specs'
  | 'bulky-physical'
  | 'bulky-special'
  | 'physical-wall'
  | 'special-wall'
  | 'setup-sweeper-physical'
  | 'setup-sweeper-special';
