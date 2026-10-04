/**
 * Moves to teach across a PC box.
 *
 * Answers "which moves should my box Pokémon learn first?": moves each
 * species can learn in the active format, that ladder sets run, and that the
 * stored Pokémon doesn't have yet. Ranked by how much the Pokémon that want a
 * move matter (ladder usage, plus a boost for Pokémon on a saved team) and how
 * standard the move is on them.
 *
 * The species data passed in is already narrowed to the format, so Gen 9 OU
 * never suggests moves that only older games teach, while National Dex does.
 */

import type { Move, Pokemon } from '../types';
import type { SmogonBundle } from '../smogon';
import { learnLabel } from '../displayNames';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// A missing move needs at least this much ladder usage on the species before it's
// worth suggesting.
export const TEACH_MIN_MOVE_PCT = 20;

// Species usage (fraction) at which meta weight saturates. ~15% usage is already a
// top-of-ladder staple in the format.
const USAGE_SATURATION = 0.15;

// A mon that's slotted into one of your saved teams matters more than one just
// sitting in storage.
const ON_TEAM_MULTIPLIER = 1.8;

export interface TeachWanter {
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
  /** How this species learns the move, e.g. "Lv 40", "TM", "Egg", "Past gen". */
  how: string;
}

export interface TeachPriorityEntry {
  moveId: string;
  moveName: string;
  type: string;
  category: string;
  /** Aggregate priority across every box mon that wants this move. */
  score: number;
  tier: 'high' | 'medium' | 'low';
  /** Mons that want this move, highest contributor first. */
  wantedBy: TeachWanter[];
}

export interface TeachMonInput {
  speciesId: string;
  moves: string[];
}

function tierFor(score: number): TeachPriorityEntry['tier'] {
  if (score >= 90) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

/** Order for picking one learn method to show: the easiest to use in a game first. */
const METHOD_ORDER = ['level', 'tm', 'tutor', 'egg', 'event', 'legacy'];
const methodRank = (learn: string) => METHOD_ORDER.indexOf(/^\d+$/.test(learn) ? 'level' : learn);

/** How a species learns a move in the active format, or null when it can't. */
export function howLearned(species: Pokemon, moveId: string): string | null {
  const id = norm(moveId);
  let best: string | null = null;
  for (const lm of species.moves) {
    if (norm(lm.move) !== id) continue;
    if (best === null || methodRank(lm.learn) < methodRank(best)) best = lm.learn;
  }
  return best === null ? null : learnLabel(best);
}

/**
 * Rank the moves worth teaching a set of stored mons.
 *
 * @param teamSpeciesIds species ids (Pokemon.id) that appear on saved teams.
 */
export function computeTeachPriorities(
  mons: TeachMonInput[],
  pokemonById: Record<string, Pokemon>,
  movesById: Record<string, Move>,
  smogon: SmogonBundle | null,
  teamSpeciesIds: Set<string> = new Set(),
): TeachPriorityEntry[] {
  if (!smogon) return [];
  const byMove = new Map<string, TeachPriorityEntry>();

  for (const mon of mons) {
    const sp = pokemonById[mon.speciesId];
    if (!sp) continue;
    const intel = smogon.species[sp.id];
    if (!intel) continue;

    const own = new Set(mon.moves.map(norm).filter(Boolean));
    const onTeam = teamSpeciesIds.has(sp.id);
    const metaWeight = 0.4 + 0.6 * Math.min(1, intel.usage / USAGE_SATURATION);
    const teamMult = onTeam ? ON_TEAM_MULTIPLIER : 1;

    for (const m of intel.moves) {
      if (m.pct < TEACH_MIN_MOVE_PCT) continue; // not standard enough to suggest
      const nm = norm(m.name);
      if (own.has(nm)) continue; // already runs it
      const how = howLearned(sp, nm);
      if (!how) continue; // can't learn it in this format
      const move = movesById[nm];
      if (!move) continue; // not a move in this format

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
        how,
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
