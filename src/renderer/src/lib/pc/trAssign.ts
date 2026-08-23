/**
 * TR assignment - the inverse of {@link ./trPriority}.
 *
 * trPriority asks "across my box, which taught moves should I chase?". This
 * module answers the other direction: "I have *this* TR in hand - which mon in
 * the box should I teach it to?" Given a single move, it ranks the box mons that
 * (a) can actually be taught it and (b) don't already run it, by how much that
 * mon wants it - ladder usage of the move on the species, the species' own meta
 * relevance, and a boost when the mon is slotted on a saved team.
 *
 * Pure + dependency-light so it unit-tests in the node vitest env.
 */

import type { Move, Pokemon } from '../types';
import type { SmogonBundle } from '../smogon';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Only TM/tutor moves are "TRs" - a record you farm and apply. Level-up moves
// come for free; egg/legacy moves are bred. A species that can't be taught the
// move via TM/tutor simply isn't a candidate for the record.
const TAUGHT_TAGS = new Set(['tm', 'tutor']);

// Species usage (fraction) at which meta weight saturates - mirrors trPriority.
const USAGE_SATURATION = 0.15;

// A mon already on one of your saved teams matters more than box filler.
const ON_TEAM_MULTIPLIER = 1.8;

// Learnable-but-never-run mons still surface (you *can* give them the TR), just
// with a tiny floor so any mon that competitively wants the move outranks them.
const COVERAGE_FLOOR = 0.04;

export interface TrAssignCandidate {
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
  /** Higher = stronger recommendation to give this mon the TR. */
  score: number;
  tier: 'high' | 'medium' | 'low';
  /** Short human-readable justification. */
  reason: string;
}

export interface TrAssignNote {
  slot: number;
  speciesName: string;
  nickname: string | null;
}

export interface TrAssignResult {
  moveId: string;
  moveName: string;
  type: string;
  category: string;
  /** Mons that can learn it and don't yet run it, best recipient first. */
  candidates: TrAssignCandidate[];
  /** Mons already running the move - no record needed. */
  alreadyKnow: TrAssignNote[];
  /** How many box mons simply can't be taught this move. */
  cannotLearnCount: number;
}

export interface TrAssignMon {
  slot: number;
  speciesId: string;
  nickname?: string | null;
  moves: string[];
}

function tierFor(score: number): TrAssignCandidate['tier'] {
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
 * Rank the mons in a box that should receive a given TR.
 *
 * @param moveId           the move to assign (any id/name form; normalized internally).
 * @param teamSpeciesIds   species ids that appear on saved teams (weighted up).
 * @returns null if the move isn't in the dataset, otherwise a ranked result.
 */
export function assignTr(
  moveId: string,
  mons: TrAssignMon[],
  pokemonById: Record<string, Pokemon>,
  movesById: Record<string, Move>,
  smogon: SmogonBundle | null,
  teamSpeciesIds: Set<string> = new Set(),
): TrAssignResult | null {
  const target = norm(moveId);
  const move = movesById[target];
  if (!move) return null;

  const candidates: TrAssignCandidate[] = [];
  const alreadyKnow: TrAssignNote[] = [];
  let cannotLearnCount = 0;

  for (const mon of mons) {
    const sp = pokemonById[mon.speciesId];
    if (!sp) continue;

    // Can this species even be taught the move via TM/tutor?
    let learnable = false;
    for (const lm of sp.moves) {
      if (TAUGHT_TAGS.has(lm.learn) && norm(lm.move) === target) {
        learnable = true;
        break;
      }
    }
    if (!learnable) {
      cannotLearnCount++;
      continue;
    }

    const note: TrAssignNote = { slot: mon.slot, speciesName: sp.name, nickname: mon.nickname ?? null };

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
