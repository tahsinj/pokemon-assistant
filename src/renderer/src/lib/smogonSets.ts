/**
 * General-purpose resolution of curated Smogon sets against the format's
 * learnsets, shared by the team-side features (best-6 advice). The battle
 * predictor keeps its own copy of this pattern in
 * battle/predictor/smogonPriors.ts - that module is engine-internal.
 */

import type { Pokemon } from './types';
import type { SmogonSet, SmogonSpeciesIntel } from './smogon';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Resolve a set's slash slots to concrete move names: per slot, the first
 * option the species can actually learn in the format. Unresolvable slots are
 * dropped; result is deduped.
 */
export function resolveSetMoves(species: Pokemon, set: SmogonSet): string[] {
  const canLearn = new Set(species.moves.map((m) => m.move));
  const out: string[] = [];
  for (const slot of set.moves) {
    const pick = slot.find((opt) => canLearn.has(norm(opt)));
    if (pick && !out.includes(pick)) out.push(pick);
  }
  return out.slice(0, 4);
}

export interface MatchedSet {
  name: string;
  set: SmogonSet;
  /** Slash slots resolved to learnable moves. */
  moves: string[];
  matchScore: number;
}

/**
 * Which curated set does this stored mon most resemble? Score = overlap of
 * its known moves with the set's resolved moves, +0.5 for matching nature,
 * +0.5 for running one of the set's items. Null when the species has no sets.
 */
export function bestMatchingSet(
  rec: { moves: string[]; nature: string; item: string | null },
  species: Pokemon,
  intel: SmogonSpeciesIntel,
): MatchedSet | null {
  const entries = Object.entries(intel.sets ?? {});
  if (entries.length === 0) return null;

  const ownMoves = new Set(rec.moves.map(norm));
  let best: MatchedSet | null = null;
  for (const [name, set] of entries) {
    const moves = resolveSetMoves(species, set);
    if (moves.length === 0) continue;
    let score = moves.filter((m) => ownMoves.has(norm(m))).length;
    if (set.nature && norm(set.nature) === norm(rec.nature)) score += 0.5;
    if (rec.item && set.item.some((it) => norm(it) === norm(rec.item!))) score += 0.5;
    if (!best || score > best.matchScore) best = { name, set, moves, matchScore: score };
  }
  return best;
}
