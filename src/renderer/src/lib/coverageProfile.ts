/**
 * Beginner-facing matchup intel for a single species, derived from popular
 * movesets rather than typing alone:
 *
 *  - offensiveCoverage: which defending types this mon can hit super-effectively,
 *    weighted by how often its sets actually carry the move. Uses real Smogon
 *    move-usage % when available (probability), else the learnset ("can hit").
 *  - threatSummary: the danger side - which common meta mons OUTSPEED this mon
 *    AND carry a super-effective move, so you shouldn't lead/switch it in even
 *    when you'd hit them for 2x. Aggregated into "risky into <type>".
 *  - quickVerdict: a real speed-aware 1v1 verdict (reuses the @smogon/calc
 *    engine in matchup.ts) for "should I send this in vs X?".
 *
 * Pure - no DOM, no IO. Tested in coverageProfile.test.ts.
 */
import type { Pokemon, Move } from './types';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';
import { TYPES, effectiveness, type Type } from './typechart';
import { assumedOpponentSpec } from './opponentSet';
import { suggestMoveset } from './recommender';
import { evaluateSpecMatchup, type MatchupCell } from './matchup';

// -- Offensive coverage ------------------------------------------------------

export interface CoverageEntry {
  /** Defending type this mon can hit for >=2x (evaluated vs a mono-type target). */
  type: Type;
  /** Best multiplier among the responsible moves (2 vs a single type; >1). */
  mult: number;
  /** 0..1 chance a set carries such a move (Smogon usage). null = learnset-only. */
  prob: number | null;
  /** Display name of the move responsible. */
  via: string;
  /** Whether the responsible move is one of the mon's STAB types. */
  stab: boolean;
}

export interface OffensiveCoverage {
  /** true when probabilities come from real usage data; false = learnset guess. */
  hasUsage: boolean;
  /** Covered types, best first (prob desc for usage; STAB-first then name otherwise). */
  entries: CoverageEntry[];
}

interface CandidateMove {
  type: Type;
  name: string;
  /** Set-inclusion share 0..1, or null when from the raw learnset. */
  share: number | null;
}

const isType = (t: string): t is Type => (TYPES as readonly string[]).includes(t);

/** Damaging moves a set is likely to carry, with their usage share when known. */
function candidateMoves(
  p: Pokemon,
  moves: Record<string, Move>,
  intel: SmogonSpeciesIntel | null,
): CandidateMove[] {
  if (intel && intel.moves.length) {
    const byName: Record<string, Move> = {};
    for (const id in moves) byName[moves[id].name.toLowerCase()] = moves[id];
    const out: CandidateMove[] = [];
    for (const um of intel.moves) {
      const mv = byName[um.name.toLowerCase()];
      if (mv && (mv.power ?? 0) > 0 && isType(mv.type.toLowerCase())) {
        out.push({ type: mv.type.toLowerCase() as Type, name: mv.name, share: um.pct / 100 });
      }
    }
    if (out.length) return out;
  }
  // No usage data -> base coverage on the mon's RECOMMENDED set (STAB + the few
  // coverage moves it would realistically run), not its entire learnset. Most
  // mons can learn a coverage TM of nearly every type, so the full learnset
  // lights up all 18 and tells you nothing.
  const seen = new Set<string>();
  const out: CandidateMove[] = [];
  for (const { move: mv } of suggestMoveset(p, moves)) {
    const t = mv.type.toLowerCase();
    if ((mv.power ?? 0) > 0 && isType(t) && !seen.has(t)) {
      seen.add(t);
      out.push({ type: t as Type, name: mv.name, share: null });
    }
  }
  return out;
}

export function offensiveCoverage(
  p: Pokemon,
  moves: Record<string, Move>,
  intel: SmogonSpeciesIntel | null,
): OffensiveCoverage {
  const cands = candidateMoves(p, moves, intel);
  const hasUsage = cands.some((c) => c.share !== null);
  const stabTypes = new Set(p.types.map((t) => t.toLowerCase()));

  const entries: CoverageEntry[] = [];
  for (const def of TYPES) {
    let best: CoverageEntry | null = null;
    for (const c of cands) {
      const mult = effectiveness(c.type, [def]);
      if (mult < 2) continue;
      const prob = c.share;
      // Prefer the higher-probability move; ties broken by multiplier.
      const better =
        !best ||
        (prob ?? 0) > (best.prob ?? 0) ||
        ((prob ?? 0) === (best.prob ?? 0) && mult > best.mult);
      if (better) {
        best = { type: def, mult, prob, via: c.name, stab: stabTypes.has(c.type) };
      }
    }
    if (best) entries.push(best);
  }

  entries.sort((a, b) => {
    if (hasUsage) return (b.prob ?? 0) - (a.prob ?? 0) || b.mult - a.mult;
    // Learnset: STAB coverage first, then alphabetical.
    if (a.stab !== b.stab) return a.stab ? -1 : 1;
    return a.type.localeCompare(b.type);
  });

  return { hasUsage, entries };
}

// -- Threat summary (the "what to avoid" side) -------------------------------

export interface FastThreat {
  id: string;
  name: string;
  usage: number;
  /** Attacking type it threatens this mon with. */
  viaType: Type;
  /** How hard that type hits this mon (2 or 4). */
  mult: number;
  /** Move name responsible (best-guess from its usage moves). */
  move: string;
}

export interface RiskyType {
  type: Type;
  /** How hard this attacking type hits this mon (2 or 4). */
  mult: number;
  /** Aggregate severity used for ranking. */
  weight: number;
  /** A few common mons that attack with this type, faster ones first. */
  examples: { id: string; name: string; faster: boolean }[];
}

export interface ThreatSummary {
  /** Attacking types most dangerous in the live meta, worst first. */
  riskyTypes: RiskyType[];
  /** Specific common mons that outspeed this mon AND hit it super-effectively. */
  fastThreats: FastThreat[];
}

/** Base-speed proxy: opponent likely outspeeds when its base Speed is higher. */
function likelyFaster(opp: Pokemon, me: Pokemon): boolean {
  return opp.baseStats.spe > me.baseStats.spe;
}

export function threatSummary(
  p: Pokemon,
  allPokemon: Pokemon[],
  smogon: SmogonBundle | null,
  moves: Record<string, Move>,
): ThreatSummary {
  const byId: Record<string, Pokemon> = {};
  for (const sp of allPokemon) byId[sp.id] = sp;

  const fastThreats: FastThreat[] = [];
  // Per attacking type: accumulated weight + example mons.
  const typeAgg: Record<string, { mult: number; weight: number; examples: Map<string, { name: string; faster: boolean; usage: number }> }> = {};

  const byName: Record<string, Move> = {};
  for (const mid in moves) byName[moves[mid].name.toLowerCase()] = moves[mid];

  const species = smogon?.species ?? {};
  for (const id in species) {
    if (id === p.id) continue;
    const intel = species[id];
    const opp = byId[id];
    if (!opp) continue;
    const faster = likelyFaster(opp, p);

    // Strongest super-effective move this opponent records against us.
    let bestType: Type | null = null;
    let bestMult = 1;
    let bestMove = '';
    let bestShare = 0;
    for (const um of intel.moves) {
      const mv = byName[um.name.toLowerCase()];
      if (!mv || (mv.power ?? 0) <= 0 || !isType(mv.type.toLowerCase())) continue;
      const at = mv.type.toLowerCase() as Type;
      const mult = effectiveness(at, p.types);
      if (mult <= 1) continue;
      const share = um.pct / 100;

      // Aggregate the type-level risk across the meta. Faster attackers count
      // full; slower ones still chip in (you can be revenge-killed / forced out).
      const w = intel.usage * share * (faster ? 1 : 0.4) * (mult >= 4 ? 1.5 : 1);
      const agg = (typeAgg[at] ??= { mult, weight: 0, examples: new Map() });
      agg.mult = Math.max(agg.mult, mult);
      agg.weight += w;
      const ex = agg.examples.get(id);
      if (!ex || faster && !ex.faster) agg.examples.set(id, { name: opp.name, faster, usage: intel.usage });

      if (mult > bestMult || (mult === bestMult && share > bestShare)) {
        bestType = at;
        bestMult = mult;
        bestMove = mv.name;
        bestShare = share;
      }
    }

    if (faster && bestType) {
      fastThreats.push({ id, name: opp.name, usage: intel.usage, viaType: bestType, mult: bestMult, move: bestMove });
    }
  }

  const riskyTypes: RiskyType[] = Object.entries(typeAgg)
    .map(([type, a]) => ({
      type: type as Type,
      mult: a.mult,
      weight: a.weight,
      examples: [...a.examples.values()]
        .sort((x, y) => Number(y.faster) - Number(x.faster) || y.usage - x.usage)
        .slice(0, 3)
        .map((e) => ({ id: '', name: e.name, faster: e.faster })),
    }))
    .sort((a, b) => b.weight - a.weight);

  fastThreats.sort((a, b) => b.usage - a.usage);

  return { riskyTypes, fastThreats };
}

// -- Quick 1v1 verdict -------------------------------------------------------

/**
 * "Should I send `mine` in against `opp`?" - a real speed-aware verdict from
 * `mine`'s perspective, assuming standard competitive sets for both sides.
 * Verdict win/trade/lose already factors who's faster and each side's KO race.
 */
export function quickVerdict(
  mine: Pokemon,
  opp: Pokemon,
  smogon: SmogonBundle | null,
  moves: Record<string, Move>,
  level = 50,
): MatchupCell {
  const myIntel = smogon?.species[mine.id] ?? null;
  const oppIntel = smogon?.species[opp.id] ?? null;
  const mySet = assumedOpponentSpec(mine, level, myIntel, moves, 'competitive');
  const oppSet = assumedOpponentSpec(opp, level, oppIntel, moves, 'competitive');
  return evaluateSpecMatchup(
    { p: mine, input: mySet.input, ability: mySet.ability },
    { p: opp, input: oppSet.input, ability: oppSet.ability },
    moves,
  );
}
