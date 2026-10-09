/**
 * One-on-one win chances: the trained matchup model when its pack is
 * downloaded, otherwise a heuristic on the same features. Every result says
 * which one produced it.
 */
import type { BattlePokemonSpec } from '../lib/battle/types';
import { featureVector, matchupFeatures } from './matchupFeatures';
import { runModel } from './runtime';

export type ScoreSource = 'model' | 'heuristic';

export interface MatchupScores {
  /** P(A beats B) for each pair, in order. */
  win: number[];
  source: ScoreSource;
}

/** The fallback: who KOs first, then who is faster, through a logistic curve. */
export function heuristicWin(f: Record<string, number>): number {
  const z =
    0.9 * Math.max(-4, Math.min(4, f.hits_diff)) +
    1.2 * (f.a_faster - 0.5) +
    0.4 * (f.a_recovery - f.b_recovery) +
    0.3 * (f.a_setup - f.b_setup);
  return 1 / (1 + Math.exp(-z));
}

export const modelName = (format: string) => `matchup-${format}`;

export async function scoreMatchups(format: string, pairs: [BattlePokemonSpec, BattlePokemonSpec][]): Promise<MatchupScores> {
  const features = pairs.map(([a, b]) => matchupFeatures(a, b));
  const model = await runModel(modelName(format), features.map(featureVector));
  if (model) return { win: model, source: 'model' };
  return { win: features.map(heuristicWin), source: 'heuristic' };
}
