/**
 * Who should learn a move: the inverse of {@link ./teachPriority}.
 *
 * Given one move, rank the box Pokémon that can learn it in the active format
 * and don't run it yet, by how much each wants it: ladder usage of the move on
 * the species, the species' own ladder usage, and a boost for Pokémon on a
 * saved team.
 */

import type { Move, Pokemon } from '../types';
import type { SmogonBundle } from '../smogon';
import { howLearned } from './teachPriority';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Species usage (fraction) at which meta weight saturates, as in teachPriority.
const USAGE_SATURATION = 0.15;

// A mon already on one of your saved teams matters more than box filler.
const ON_TEAM_MULTIPLIER = 1.8;

// Learnable-but-never-run mons still show up (they can learn it), with a tiny
// floor so any mon that competitively wants the move outranks them.
const COVERAGE_FLOOR = 0.04;

export interface TeachCandidate {
  slot: number;
  speciesId: string;
  speciesName: string;
  nickname: string | null;
  /** Ladder usage of this move on this species, 0..100 (0 = learnable but unlisted). */
  moveUsagePct: number;
  /** Species ladder usage as a fraction, 0..1. */
  speciesUsage: number;
  /** This mon is on a saved team. */
  onTeam: boolean;
  /** Higher = stronger recommendation to teach this mon the move. */
  score: number;
  tier: 'high' | 'medium' | 'low';
  /** Short human-readable justification. */
  reason: string;
  /** How this species learns the move, e.g. "Lv 40", "TM", "Egg", "Past gen". */
  how: string;
}

export interface TeachAssignNote {
  slot: number;
  speciesName: string;
  nickname: string | null;
}

export interface TeachAssignResult {
  moveId: string;
  moveName: string;
  type: string;
  category: string;
  /** Mons that can learn it and don't yet run it, best recipient first. */
  candidates: TeachCandidate[];
  /** Mons already running the move. */
  alreadyKnow: TeachAssignNote[];
  /** How many box mons can't learn this move in this format. */
  cannotLearnCount: number;
}

export interface TeachMon {
  slot: number;
  speciesId: string;
  nickname?: string | null;
  moves: string[];
}

function tierFor(score: number): TeachCandidate['tier'] {
  if (score >= 50) return 'high';
  if (score >= 20) return 'medium';
  return 'low';
}

function reasonFor(speciesName: string, moveUsagePct: number, onTeam: boolean): string {
  const team = onTeam ? 'On your team - ' : '';
  if (moveUsagePct >= 50) return `${team}standard on ${speciesName} (${moveUsagePct.toFixed(0)}% of ladder sets)`;
  if (moveUsagePct >= 20) return `${team}common on ${speciesName} (${moveUsagePct.toFixed(0)}%)`;
  if (moveUsagePct > 0) return `${team}niche on ${speciesName} (${moveUsagePct.toFixed(0)}%)`;
  return `${team}learnable, but rarely run competitively`;
}

/**
 * Rank the mons in a box that should learn a given move.
 *
 * @param moveId           the move to assign (any id/name form; normalized internally).
 * @param teamSpeciesIds   species ids that appear on saved teams (weighted up).
 * @returns null if the move isn't in the dataset, otherwise a ranked result.
 */
export function rankLearners(
  moveId: string,
  mons: TeachMon[],
  pokemonById: Record<string, Pokemon>,
  movesById: Record<string, Move>,
  smogon: SmogonBundle | null,
  teamSpeciesIds: Set<string> = new Set(),
): TeachAssignResult | null {
  const target = norm(moveId);
  const move = movesById[target];
  if (!move) return null;

  const candidates: TeachCandidate[] = [];
  const alreadyKnow: TeachAssignNote[] = [];
  let cannotLearnCount = 0;

  for (const mon of mons) {
    const sp = pokemonById[mon.speciesId];
    if (!sp) continue;

    // Can this species learn the move at all in this format?
    const how = howLearned(sp, target);
    if (!how) {
      cannotLearnCount++;
      continue;
    }

    const note: TeachAssignNote = { slot: mon.slot, speciesName: sp.name, nickname: mon.nickname ?? null };

    if (mon.moves.some((m) => norm(m) === target)) {
      alreadyKnow.push(note);
      continue;
    }

    const intel = smogon?.species[sp.id] ?? null;
    const moveUsagePct = intel?.moves.find((m) => norm(m.name) === target)?.pct ?? 0;
    const speciesUsage = intel?.usage ?? 0;
    const onTeam = teamSpeciesIds.has(sp.id);

    const want = Math.max(COVERAGE_FLOOR, moveUsagePct / 100);
    const metaWeight = 0.4 + 0.6 * Math.min(1, speciesUsage / USAGE_SATURATION);
    const teamMult = onTeam ? ON_TEAM_MULTIPLIER : 1;
    const score = want * metaWeight * teamMult * 100;

    candidates.push({
      slot: mon.slot,
      speciesId: sp.id,
      speciesName: sp.name,
      nickname: note.nickname,
      moveUsagePct,
      speciesUsage,
      onTeam,
      score,
      tier: tierFor(score),
      reason: reasonFor(sp.name, moveUsagePct, onTeam),
      how,
    });
  }

  candidates.sort(
    (a, b) => b.score - a.score || b.moveUsagePct - a.moveUsagePct || a.speciesName.localeCompare(b.speciesName),
  );

  return {
    moveId: target,
    moveName: move.name,
    type: move.type,
    category: move.category,
    candidates,
    alreadyKnow,
    cannotLearnCount,
  };
}
