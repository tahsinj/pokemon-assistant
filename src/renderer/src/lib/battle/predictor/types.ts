/**
 * Predictor types. Re-exports the inline shape stored on
 * `BattlePokemon.uncertainty` so the predictor module is the canonical owner
 * of these types, even though they appear on `state.ts` to keep import
 * cycles out of the reducer.
 */

import type { Move, Pokemon } from '../../types';
import type { PredictedSet, PredictorEvidence } from '../state';

export type { PredictedSet, PredictorEvidence };

/** A candidate set the generator can produce, before posterior weights. */
export interface CandidateSet {
  id: string;
  label: string;
  nature: string;
  ability: string;
  item: string | null;
  teraType: string | null;
  ivs: import('../../types').BaseStats;
  evs: import('../../types').BaseStats;
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
  /** Optional custom set pool indexed by species id (e.g. cobblemon trainer JSONs). */
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
