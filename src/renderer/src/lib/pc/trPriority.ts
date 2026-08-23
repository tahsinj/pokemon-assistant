/**
 * TR (Technical Record) priority list for a PC box.
 *
 * Cobblemon teaches non-level moves via TM/tutor items ("TRs"). This module
 * scans the mons in a box and answers: "Across everything I'm storing, which
 * taught moves should I acquire first?" - ranked by how much each mon that wants
 * the move matters (ladder usage = meta impact, plus a boost for mons on a saved
 * team) and how standard the move is for that mon.
 *
 * Pure + dependency-light so it unit-tests in the node vitest env.
 */

import type { Move, Pokemon } from '../types';
import type { SmogonBundle } from '../smogon';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// A move only counts as a "TR" if the species must be *taught* it. Level-up moves
// come for free as the mon grows; egg/legacy moves are bred, not farmed as records.
const TAUGHT_TAGS = new Set(['tm', 'tutor']);

// A missing move needs at least this much ladder usage on the species before it's
// worth flagging as a TR to chase.
export const TR_MIN_MOVE_PCT = 20;

// Species usage (fraction) at which meta weight saturates. ~15% usage is already a
// top-of-ladder staple in NatDex OU.
const USAGE_SATURATION = 0.15;

// A mon that's slotted into one of your saved teams matters more than one just
// sitting in storage.
const ON_TEAM_MULTIPLIER = 1.8;

export interface TrWanter {
  speciesId: string;
  speciesName: string;
  /** Ladder usage of this move on this species, 0..100. */
  moveUsagePct: number;
  /** Species ladder usage as a fraction, 0..1. */
  speciesUsage: number;
  /** This mon's species is on a saved team. */
  onTeam: boolean;
  /** This mon's contribution to the move's aggregate score. */
  points: number;
}

export interface TrPriorityEntry {
  moveId: string;
  moveName: string;
  type: string;
  category: string;
  /** Aggregate priority across every box mon that wants this TR. */
  score: number;
  tier: 'high' | 'medium' | 'low';
  /** Mons that want this TR, highest contributor first. */
  wantedBy: TrWanter[];
}

export interface TrMonInput {
  speciesId: string;
  moves: string[];
}

function tierFor(score: number): TrPriorityEntry['tier'] {
  if (score >= 90) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

/**
 * Rank the taught moves worth acquiring for a set of stored mons.
 *
 * @param teamSpeciesIds species ids (Pokemon.id) that appear on saved teams.
 */
export function computeTrPriorities(
  mons: TrMonInput[],
  pokemonById: Record<string, Pokemon>,
  movesById: Record<string, Move>,
  smogon: SmogonBundle | null,
  teamSpeciesIds: Set<string> = new Set(),
): TrPriorityEntry[] {
  if (!smogon) return [];
  const byMove = new Map<string, TrPriorityEntry>();

  for (const mon of mons) {
    const sp = pokemonById[mon.speciesId];
    if (!sp) continue;
    const intel = smogon.species[sp.id];
    if (!intel) continue;

    // What this species must be taught, by normalized move id.
    const taught = new Set<string>();
    for (const lm of sp.moves) if (TAUGHT_TAGS.has(lm.learn)) taught.add(norm(lm.move));

    const own = new Set(mon.moves.map(norm).filter(Boolean));
    const onTeam = teamSpeciesIds.has(sp.id);
    const metaWeight = 0.4 + 0.6 * Math.min(1, intel.usage / USAGE_SATURATION);
    const teamMult = onTeam ? ON_TEAM_MULTIPLIER : 1;

    for (const m of intel.moves) {
      if (m.pct < TR_MIN_MOVE_PCT) continue; // not standard enough to chase
      const nm = norm(m.name);
      if (own.has(nm)) continue; // already runs it
      if (!taught.has(nm)) continue; // not a TR for this species (level/egg/unlearnable)
      const move = movesById[nm];
      if (!move) continue; // move missing from our dataset

      const points = (m.pct / 100) * metaWeight * teamMult * 100;

      let entry = byMove.get(nm);
      if (!entry) {
        entry = {
          moveId: nm,
          moveName: move.name,
          type: move.type,
          category: move.category,
          score: 0,
          tier: 'low',
          wantedBy: [],
        };
        byMove.set(nm, entry);
      }
      entry.score += points;
      entry.wantedBy.push({
        speciesId: sp.id,
        speciesName: sp.name,
        moveUsagePct: m.pct,
        speciesUsage: intel.usage,
        onTeam,
        points,
      });
    }
  }

  const out = [...byMove.values()];
  for (const e of out) {
    e.wantedBy.sort((a, b) => b.points - a.points);
    e.tier = tierFor(e.score);
  }
  out.sort((a, b) => b.score - a.score || b.wantedBy.length - a.wantedBy.length);
  return out;
}
