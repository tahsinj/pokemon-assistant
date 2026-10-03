/**
 * Teammate recommendations for the Team Builder - "given these Pokémon, who
 * completes the squad?" Blends Smogon co-usage for the active format with
 * type-synergy analysis so it works for meta staples and off-meta species alike.
 *
 * Scoring components (weights tuned so real pairings beat raw usage):
 *   - co-usage      x3 - how often the candidate appears on current members'
 *                         ladder teams (Smogon Teammates stats)
 *   - patch weak    x2 - candidate resists types >=2 members are weak to
 *   - new coverage  x1 - candidate STAB hits types the team can't hit SE
 *   - usage prior   x1 - sqrt(usage), meta staples break ties
 *   - pile-on       -0.5 per stacked weakness the candidate shares
 */

import type { Pokemon } from './types';
import type { SmogonBundle } from './smogon';
import { TYPES, effectiveness } from './typechart';

export interface TeammateSuggestion {
  p: Pokemon;
  score: number;
  reasons: string[];
}

// Slow-pivot <-> wallbreaker momentum: a slow U-turn / Teleport user that can
// hand the turn to a frail, hard-hitting partner is a real structural pairing
// the raw co-usage number doesn't always capture (esp. for Cobblemon-only mons
// with no ladder stats). Detected off the species' learnset + stat shape.
const MOMENTUM_PIVOT_MOVES = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport']);
const moveKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function isSlowPivot(p: Pokemon): boolean {
  return p.baseStats.spe <= 70 && p.moves.some((m) => MOMENTUM_PIVOT_MOVES.has(moveKey(m.move)));
}

function isFrailBreaker(p: Pokemon): boolean {
  const b = p.baseStats;
  return Math.max(b.atk, b.spa) >= 110 && b.hp + b.def + b.spd <= 260;
}

export function suggestTeammates(
  team: Pokemon[],
  pool: Pokemon[],
  smogon: SmogonBundle | null,
  limit = 6,
): TeammateSuggestion[] {
  const teamIds = new Set(team.map((m) => m.id));
  const candidates = pool.filter((p) => !teamIds.has(p.id));

  // Empty team: rank by ladder usage alone.
  if (team.length === 0) {
    return candidates
      .map((p) => {
        const usage = smogon?.species[p.id]?.usage ?? 0;
        return {
          p,
          score: Math.sqrt(usage),
          reasons: usage > 0 ? [`${smogon?.meta.label ?? 'Ladder'} staple - ${(usage * 100).toFixed(1)}% usage`] : [],
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Types at least two current members are weak to / can't hit SE.
  const stackedWeak: string[] = [];
  const uncovered: string[] = [];
  for (const t of TYPES) {
    let weak = 0;
    let bestStab = 0;
    for (const m of team) {
      if (effectiveness(t, m.types) > 1) weak++;
      for (const stab of m.types) bestStab = Math.max(bestStab, effectiveness(stab, [t]));
    }
    if (weak >= 2) stackedWeak.push(t);
    if (bestStab < 2) uncovered.push(t);
  }

  const scored = candidates.map((p) => {
    const reasons: string[] = [];
    let score = 0;

    // Smogon co-usage: mean teammate-% from each member toward this candidate.
    if (smogon) {
      let pctSum = 0;
      let withStats = 0;
      let bestPair: { name: string; pct: number } | null = null;
      for (const m of team) {
        const intel = smogon.species[m.id];
        if (!intel) continue;
        withStats++;
        const tm = intel.teammates.find((t) => t.id === p.id);
        if (tm) {
          pctSum += tm.pct;
          if (!bestPair || tm.pct > bestPair.pct) bestPair = { name: intel.name, pct: tm.pct };
        }
      }
      if (withStats > 0 && pctSum > 0) {
        const avg = pctSum / withStats;
        score += 3 * Math.min(1, avg / 30);
        if (bestPair) {
          reasons.push(`on ${bestPair.pct.toFixed(0)}% of ${bestPair.name} teams`);
        }
      }
    }

    // Patch stacked weaknesses.
    const patched = stackedWeak.filter((t) => effectiveness(t, p.types) < 1);
    if (patched.length > 0 && stackedWeak.length > 0) {
      score += 2 * (patched.length / stackedWeak.length);
      reasons.push(`covers team ${patched.join(' / ')} weakness`);
    }

    // New super-effective STAB coverage.
    const newCoverage = uncovered.filter((t) =>
      p.types.some((stab) => effectiveness(stab, [t]) >= 2),
    );
    if (newCoverage.length > 0) {
      score += Math.min(1, newCoverage.length / 6);
      reasons.push(`adds SE coverage vs ${newCoverage.slice(0, 3).join(' / ')}`);
    }

    // Usage prior.
    const usage = smogon?.species[p.id]?.usage ?? 0;
    if (usage > 0) {
      score += Math.sqrt(usage);
      reasons.push(`${(usage * 100).toFixed(1)}% ${smogon?.meta.label ?? 'ladder'} usage`);
    }

    // Momentum pairing: candidate completes a slow-pivot <-> wallbreaker core.
    const momentum =
      (isSlowPivot(p) && team.some(isFrailBreaker)) ||
      (isFrailBreaker(p) && team.some(isSlowPivot));
    if (momentum) {
      score += 1;
      reasons.push(isSlowPivot(p) ? 'pivots into your breaker' : 'wallbreaker for your slow pivot');
    }

    // Pile-on penalty: shares an already-stacked weakness.
    const pileOn = stackedWeak.filter((t) => effectiveness(t, p.types) > 1);
    score -= 0.5 * pileOn.length;

    return { p, score, reasons };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
