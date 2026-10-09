import type { Move, Pokemon } from './types';
import type { SmogonSpeciesIntel } from './smogon';
import { resolveSetMoves } from './smogonSets';

/**
 * Learnset pools: 'levelup' = self-learnt (numeric learn tags), 'tm' = moves
 * that must be taught (tm + tutor tags), 'all' = everything incl. egg/legacy.
 */
export type MovePool = 'all' | 'levelup' | 'tm';

export interface MovesetOptions {
  pool?: MovePool;
  /** When present, move scores are biased toward ladder usage in the active format. */
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Setup moves boost the user's offensive stats -> they enable sweeps and are
// slot-worthy on offensive mons, not generic "utility". Keyed by normalized name.
// Exported so the team role classifier (`teamRoles.ts`) shares one source of
// truth for what counts as setup / recovery / utility. Keyed by normalized name.
export const SETUP_MOVES = new Set(
  [
    'Swords Dance', 'Dragon Dance', 'Bulk Up', 'Coil', 'Howl', 'Sharpen', 'Work Up', 'Meditate',
    'Nasty Plot', 'Calm Mind', 'Quiver Dance', 'Tail Glow', 'Growth', 'Geomancy', 'Charge Beam',
    'Shell Smash', 'Shift Gear', 'Agility', 'Rock Polish', 'Autotomize', 'No Retreat',
    'Victory Dance', 'Take Heart', 'Clangorous Soul', 'Belly Drum', 'Curse', 'Tidy Up',
    'Iron Defense', 'Acid Armor', 'Cosmic Power', 'Hone Claws', 'Calm Mind',
  ].map(norm),
);
export const RECOVERY_MOVES = new Set(
  ['Recover', 'Roost', 'Slack Off', 'Soft-Boiled', 'Synthesis', 'Moonlight', 'Morning Sun', 'Shore Up', 'Milk Drink', 'Strength Sap', 'Wish', 'Rest'].map(norm),
);
export const UTILITY_MOVES = new Set(
  [
    'Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web', 'Defog', 'Rapid Spin', 'Thunder Wave',
    'Will-O-Wisp', 'Toxic', 'Taunt', 'Encore', 'Trick', 'Switcheroo', 'Parting Shot', 'Heal Bell',
    'Aromatherapy', 'Reflect', 'Light Screen', 'Aurora Veil', 'Yawn', 'Whirlwind', 'Roar',
    'Dragon Tail', 'Sleep Powder', 'Spore', 'Leech Seed', 'Wish',
  ].map(norm),
);

/**
 * Physical vs special bias. Prefer what the ladder actually runs (top spreads'
 * EV investment) over raw base stats - Lucario has SpA >= Atk but is a physical
 * Swords Dance sweeper. Falls back to base stats without Smogon data.
 */
export function offensiveBias(p: Pokemon, smogon?: SmogonSpeciesIntel | null): 'physical' | 'special' {
  const spreads = smogon?.spreads;
  if (spreads && spreads.length) {
    let atk = 0;
    let spa = 0;
    for (const s of spreads) {
      atk += (s.evs[1] ?? 0) * s.pct;
      spa += (s.evs[3] ?? 0) * s.pct;
    }
    if (atk !== spa) return atk > spa ? 'physical' : 'special';
  }
  return p.baseStats.atk >= p.baseStats.spa ? 'physical' : 'special';
}

// Score a move for a given species. Higher = better pick.
//   - Effective power (soft-capped 100), STAB +50, attacker-category match +/-,
//     priority +10, drawback penalties.
//   - Status moves are tiered: setup > recovery ~ utility > junk.
//   - Smogon usage adds up to +60 (capped) so the ladder informs ranking.
// `physical` overrides the base-stat guess with the caller's inferred bias.
export function scoreMove(
  p: Pokemon,
  m: Move,
  smogon?: SmogonSpeciesIntel | null,
  physical?: boolean,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const physAttacker = physical ?? p.baseStats.atk >= p.baseStats.spa;

  // Ladder reality check: what players in the format actually click, capped so
  // usage informs rather than dictates.
  const usagePct = smogonUsagePct(smogon, m);
  if (usagePct > 0) {
    score += Math.min(60, usagePct);
    reasons.push(`${Math.round(usagePct)}% ladder usage`);
  }

  if (m.category === 'Status') {
    const key = norm(m.name);
    if (SETUP_MOVES.has(key)) {
      score += 55;
      reasons.push('setup move');
    } else if (RECOVERY_MOVES.has(key) || m.flags.includes('heal')) {
      score += 42;
      reasons.push('recovery');
    } else if (UTILITY_MOVES.has(key)) {
      score += 38;
      reasons.push('utility move');
    } else {
      score += 8;
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
  const physical = offensiveBias(p, opts.smogon) === 'physical';
  const scored = pool
    .map((m) => ({ move: m, ...scoreMove(p, m, opts.smogon, physical) }))
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
 * most-used curated set (slash options resolved to what's learnable in the
 * format), padded to four with the highest-usage learnable moves; falls
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

/** Effective power = base power discounted by accuracy (true accuracy = 100%). */
function effPower(m: Move): number {
  return (m.power || 0) * (m.accuracy === true ? 1 : (m.accuracy || 100) / 100);
}

/**
 * TMs / tutor moves worth teaching, ranked. Excludes moves the species also
 * learns by level-up (those come free) - note a move can appear in the
 * learnset twice with different tags.
 *
 * "Worth a TM" is a different question from "build me a balanced set": for a
 * competitively-played species it's answered by what the ladder actually runs.
 * So ladder usage is the *primary* sort key (the heuristic `scoreMove` only
 * breaks ties and orders moves the ladder doesn't cover) - otherwise a 56%-used
 * hazard setter like Stealth Rock gets buried under zero-usage STAB attacks
 * whose raw power dwarfs the usage signal. We also prune redundant chip: a TM
 * attack the species already matches-or-beats with a same-type, same-category
 * level-up move adds nothing, so it's dropped unless the ladder vouches for it.
 */
export function tmPriorities(
  p: Pokemon,
  moves: Record<string, Move>,
  smogon?: SmogonSpeciesIntel | null,
  limit = 10,
): { move: Move; score: number; reasons: string[] }[] {
  const levelMoves = learnableMoves(p, moves, 'levelup');
  const levelIds = new Set(levelMoves.map((m) => m.id));
  const physical = offensiveBias(p, smogon) === 'physical';

  // Ladder-usage floor (%) below which an attack must earn its slot on merit:
  // if a same-type/category level-up move already hits as hard, teaching it is
  // wasted. Used moves are protected - the ladder running it is enough.
  const USAGE_FLOOR = 3;
  const redundant = (m: Move): boolean => {
    if (m.category === 'Status' || !m.power) return false;
    return levelMoves.some(
      (lm) => lm.type === m.type && lm.category === m.category && effPower(lm) >= effPower(m),
    );
  };

  return learnableMoves(p, moves, 'tm')
    .filter((m) => !levelIds.has(m.id))
    .map((m) => ({ move: m, usage: smogonUsagePct(smogon, m), ...scoreMove(p, m, smogon, physical) }))
    .filter((s) => s.usage >= USAGE_FLOOR || !redundant(s.move))
    .sort((a, b) => b.usage - a.usage || b.score - a.score)
    .slice(0, limit)
    .map(({ move, score, reasons }) => ({ move, score, reasons }));
}
