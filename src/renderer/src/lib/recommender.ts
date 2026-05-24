import type { Move, Pokemon } from './types';
import type { SmogonSpeciesIntel } from './smogon';
import { effectiveness } from './typechart';
import { resolveSetMoves } from './smogonSets';

/**
 * Learnset pools: 'levelup' = self-learnt (numeric learn tags), 'tm' = moves
 * that must be taught (tm + tutor tags), 'all' = everything incl. egg/legacy.
 */
export type MovePool = 'all' | 'levelup' | 'tm';

export interface MovesetOptions {
  pool?: MovePool;
  /** When present, move scores are biased toward NatDex OU ladder usage. */
  smogon?: SmogonSpeciesIntel | null;
}

function inPool(learn: string, pool: MovePool): boolean {
  if (pool === 'all') return true;
  if (pool === 'levelup') return /^\d+$/.test(learn);
  return learn === 'tm' || learn === 'tutor';
}

// Return pokemon's learnable move objects (that exist in our moves dataset).
export function learnableMoves(p: Pokemon, moves: Record<string, Move>, pool: MovePool = 'all'): Move[] {
  const out: Move[] = [];
  const seen = new Set<string>();
  for (const m of p.moves) {
    if (!inPool(m.learn, pool)) continue;
    const mv = moves[m.move];
    if (mv && !seen.has(mv.id)) {
      seen.add(mv.id);
      out.push(mv);
    }
  }
  return out;
}

const toMoveKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Ladder usage % for a move, 0 when unknown. */
function smogonUsagePct(intel: SmogonSpeciesIntel | null | undefined, move: Move): number {
  if (!intel) return 0;
  const hit = intel.moves.find((m) => toMoveKey(m.name) === move.id);
  return hit?.pct ?? 0;
}

// Score a move for a given species. Higher = better pick.
// Weights:
//   - STAB bonus (+50) if type matches species
//   - Attacker alignment: if atk > spa, physical moves get +15; else special +15
//   - Effective power: power * accuracy% (status floors to 40 if it has useful flags)
//   - Priority +10
//   - Status utility: +25 for common setup/utility flags
export function scoreMove(
  p: Pokemon,
  m: Move,
  smogon?: SmogonSpeciesIntel | null,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const physAttacker = p.baseStats.atk >= p.baseStats.spa;

  // Ladder reality check: what NatDex OU players actually click, capped so
  // usage informs rather than dictates.
  const usagePct = smogonUsagePct(smogon, m);
  if (usagePct > 0) {
    score += Math.min(60, usagePct);
    reasons.push(`${Math.round(usagePct)}% ladder usage`);
  }

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
    // Soft-cap effective power: most viable attacks sit at 80-120 BP, so a
    // 150-BP move shouldn't dwarf STAB / usage / drawback signals.
    const eff = Math.min(100, (m.power || 0) * acc);
    score += eff;
    if (m.power) reasons.push(`${m.power} BP × ${Math.round(acc * 100)}% acc`);

    // Drawback penalties - high raw BP that's competitively dead weight.
    if (m.flags.includes('recharge')) {
      score -= 40;
      reasons.push('recharge turn');
    } else if (m.flags.includes('charge')) {
      score -= 30;
      reasons.push('charge turn');
    }
    if (/recoil/i.test(m.desc)) {
      score -= 15;
      reasons.push('recoil');
    }

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
  opts: MovesetOptions = {},
): { move: Move; reasons: string[] }[] {
  const pool = learnableMoves(p, moves, opts.pool ?? 'all');
  const scored = pool
    .map((m) => ({ move: m, ...scoreMove(p, m, opts.smogon) }))
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

  // 2. Fill remaining with best-scoring moves of unused types for coverage.
  // At most one status slot - a set is 2 STAB + coverage + one utility move.
  let statusPicked = 0;
  for (const s of scored) {
    if (picked.length >= 4) break;
    if (picked.find((pk) => pk.move.id === s.move.id)) continue;
    if (s.move.category === 'Status') {
      if (statusPicked >= 1) continue;
      picked.push({ move: s.move, reasons: s.reasons });
      statusPicked++;
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

/**
 * The competitive "best set" when Smogon data exists. Prefers the species'
 * most-used curated set (slash options resolved to what's learnable in
 * Cobblemon), padded to four with the highest-usage learnable moves; falls
 * back to the pure usage marginals when there are no curated sets. Returns
 * null when there's no Smogon intel at all - callers then use the heuristic
 * `suggestMoveset`. This avoids the heuristic burying a 91%-used move (e.g.
 * Weather Ball on a sun sweeper) it can't recognize the value of.
 */
export function competitiveMoveset(
  p: Pokemon,
  moves: Record<string, Move>,
  intel: SmogonSpeciesIntel | null,
): { move: Move; reasons: string[] }[] | null {
  if (!intel) return null;
  const canLearn = new Set(p.moves.map((m) => m.move));
  const usagePct = (name: string) =>
    intel.moves.find((x) => toMoveKey(x.name) === toMoveKey(name))?.pct ?? 0;

  // 1. Most-representative curated set = highest summed move usage.
  const chosen: string[] = [];
  let label: string | null = null;
  let best: { name: string; moves: string[]; score: number } | null = null;
  for (const [name, set] of Object.entries(intel.sets ?? {})) {
    const resolved = resolveSetMoves(p, set);
    if (!resolved.length) continue;
    const score = resolved.reduce((a, m) => a + usagePct(m), 0);
    if (!best || score > best.score) best = { name, moves: resolved, score };
  }
  if (best) {
    chosen.push(...best.moves);
    label = best.name;
  }

  // 2. Pad to four with the most-used learnable moves not already chosen.
  const have = new Set(chosen.map(toMoveKey));
  for (const m of intel.moves) {
    if (chosen.length >= 4) break;
    const mv = moves[toMoveKey(m.name)];
    if (mv && canLearn.has(mv.id) && !have.has(toMoveKey(m.name))) {
      chosen.push(mv.name);
      have.add(toMoveKey(m.name));
      if (!label) label = 'ladder usage';
    }
  }
  if (!chosen.length) return null;

  return chosen
    .map((name) => {
      const mv = moves[toMoveKey(name)];
      if (!mv) return null;
      const reasons: string[] = [];
      const pct = usagePct(name);
      if (pct > 0) reasons.push(`${Math.round(pct)}% ladder usage`);
      if (label && label !== 'ladder usage') reasons.push(`Smogon ${label}`);
      return { move: mv, reasons };
    })
    .filter((x): x is { move: Move; reasons: string[] } => !!x);
}

/**
 * TMs / tutor moves worth teaching, ranked. Excludes moves the species also
 * learns by level-up (those come free) - note a move can appear in the
 * learnset twice with different tags.
 */
export function tmPriorities(
  p: Pokemon,
  moves: Record<string, Move>,
  smogon?: SmogonSpeciesIntel | null,
  limit = 10,
): { move: Move; score: number; reasons: string[] }[] {
  const levelIds = new Set(learnableMoves(p, moves, 'levelup').map((m) => m.id));
  return learnableMoves(p, moves, 'tm')
    .filter((m) => !levelIds.has(m.id))
    .map((m) => ({ move: m, ...scoreMove(p, m, smogon) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
