import type { Move, Pokemon } from './types';
import { effectiveness } from './typechart';

// Return pokemon's learnable move objects (that exist in our moves dataset).
export function learnableMoves(p: Pokemon, moves: Record<string, Move>): Move[] {
  const out: Move[] = [];
  const seen = new Set<string>();
  for (const m of p.moves) {
    const mv = moves[m.move];
    if (mv && !seen.has(mv.id)) {
      seen.add(mv.id);
      out.push(mv);
    }
  }
  return out;
}

// Score a move for a given species. Higher = better pick.
// Weights:
//   - STAB bonus (+50) if type matches species
//   - Attacker alignment: if atk > spa, physical moves get +15; else special +15
//   - Effective power: power * accuracy% (status floors to 40 if it has useful flags)
//   - Priority +10
//   - Status utility: +25 for common setup/utility flags
export function scoreMove(p: Pokemon, m: Move): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const physAttacker = p.baseStats.atk >= p.baseStats.spa;

  if (m.category === 'Status') {
    const util = ['heal','reflectable','mirror','snatch','protect'];
    const useful = util.some((f) => m.flags.includes(f)) || /swords|nasty|calm|bulk|iron|coil|dragon dance|quiver/i.test(m.name);
    if (useful) {
      score += 40;
      reasons.push('utility / setup move');
    } else {
      score += 10;
    }
  } else {
    const acc = m.accuracy === true ? 1 : (m.accuracy || 100) / 100;
    const eff = (m.power || 0) * acc;
    score += eff;
    if (eff > 0) reasons.push(`${m.power} BP × ${Math.round(acc * 100)}% acc`);

    if (p.types.includes(m.type)) {
      score += 50;
      reasons.push('STAB');
    }
    if ((physAttacker && m.category === 'Physical') || (!physAttacker && m.category === 'Special')) {
      score += 20;
      reasons.push(`matches ${physAttacker ? 'physical' : 'special'} attacker`);
    } else {
      score -= 15;
    }
    if (m.priority > 0) {
      score += 10;
      reasons.push(`+${m.priority} priority`);
    }
  }
  return { score, reasons };
}

// Suggest a 4-move set. Diversity: prefer 2 STAB attacks + coverage + utility.
export function suggestMoveset(
  p: Pokemon,
  moves: Record<string, Move>,
): { move: Move; reasons: string[] }[] {
  const pool = learnableMoves(p, moves);
  const scored = pool
    .map((m) => ({ move: m, ...scoreMove(p, m) }))
    .sort((a, b) => b.score - a.score);

  const picked: { move: Move; reasons: string[] }[] = [];
  const usedTypes = new Set<string>();

  // 1. Best STAB attack per species type
  for (const t of p.types) {
    const stab = scored.find(
      (s) =>
        s.move.type === t &&
        s.move.category !== 'Status' &&
        !picked.some((pk) => pk.move.id === s.move.id),
    );
    if (stab) {
      picked.push({ move: stab.move, reasons: [...stab.reasons, `STAB ${t}`] });
      usedTypes.add(stab.move.type);
    }
  }

  // 2. Fill remaining with best-scoring moves of unused types for coverage
  for (const s of scored) {
    if (picked.length >= 4) break;
    if (picked.find((pk) => pk.move.id === s.move.id)) continue;
    if (s.move.category === 'Status') {
      picked.push({ move: s.move, reasons: s.reasons });
      continue;
    }
    if (!usedTypes.has(s.move.type)) {
      picked.push({ move: s.move, reasons: [...s.reasons, 'coverage'] });
      usedTypes.add(s.move.type);
    }
  }

  // 3. Top-up if still < 4
  for (const s of scored) {
    if (picked.length >= 4) break;
    if (!picked.find((pk) => pk.move.id === s.move.id)) {
      picked.push({ move: s.move, reasons: s.reasons });
    }
  }
  return picked.slice(0, 4);
}

// Score how well "candidate" counters "target". Higher = better counter.
export function counterScore(candidate: Pokemon, target: Pokemon, moves: Record<string, Move>): number {
  // Offensive: best learnable move effectiveness vs target
  const cMoves = learnableMoves(candidate, moves).filter((m) => m.category !== 'Status' && m.power > 0);
  let bestOffense = 0;
  for (const m of cMoves) {
    const eff = effectiveness(m.type, target.types);
    const stab = candidate.types.includes(m.type) ? 1.5 : 1;
    const att = candidate.baseStats.atk >= candidate.baseStats.spa ? candidate.baseStats.atk : candidate.baseStats.spa;
    const score = m.power * eff * stab * (att / 100);
    if (score > bestOffense) bestOffense = score;
  }

  // Defensive: worst-case multiplier target's STAB vs candidate
  let worstDefense = 1;
  for (const t of target.types) {
    const mult = effectiveness(t, candidate.types);
    if (mult > worstDefense) worstDefense = mult;
  }
  const defenseScore = 100 / worstDefense;

  // Speed tiebreak
  const speedAdvantage = candidate.baseStats.spe - target.baseStats.spe;

  return bestOffense + defenseScore * 0.5 + speedAdvantage * 0.2;
}

export function topCounters(
  target: Pokemon,
  all: Pokemon[],
  moves: Record<string, Move>,
  limit = 12,
) {
  return all
    .filter((p) => p.id !== target.id)
    .map((p) => ({ p, score: counterScore(p, target, moves) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
