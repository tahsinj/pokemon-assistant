/**
 * Best-6 team builder over the user's actual PC collection.
 *
 * Pipeline: filter (underleveled out, best record per species) -> quality-rank
 * and keep a small pool -> precompute type sets, real stats, roles, and a
 * pairwise Smogon co-usage ("chemistry") matrix -> for each preset weight
 * vector, greedy-seed a team of 6 and improve it with steepest-ascent single
 * swaps -> attach per-member optimization advice diffed against the closest
 * curated Smogon set (or the usage marginals).
 *
 * Everything is synchronous and cheap: pool ≤ 24, so one preset costs ~10⁵
 * primitive ops. No smogon bundle -> quality/coverage only, advice limited.
 */

import type { BaseStats, Move, Pokemon } from './types';
import type { PcPokemonRecord, MemberDetail } from './bridgeTypes';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';
import { TYPES, effectiveness } from './typechart';
import { bst, calcAllStats } from './stats';
import { learnableMoves, scoreMove } from './recommender';
import { bestMatchingSet, type MatchedSet } from './smogonSets';
import { isNatDexOULegal } from './legality';
import { classifyMember, type RoleTag } from './teamRoles';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TeamPresetId = 'balanced' | 'offense' | 'defense';
export type Role = 'physical' | 'special' | 'bulk' | 'mixed';

export interface BestSixOptions {
  presets?: TeamPresetId[];
  /** Top-quality pool kept for the combinatorial search. */
  poolSize?: number;
  /** Candidates below targetLevel × ratio are excluded (pcCounters convention). */
  minLevelRatio?: number;
  /** Reference level; default = 90th-percentile level across the PC. */
  refLevel?: number;
  /** Exclude Pokémon banned from NatDex OU (Uber/AG). Default true. */
  legalOnly?: boolean;
  /**
   * Item recommendation gate. Return false to forbid suggesting an item (e.g.
   * a Mega Stone / Z-Crystal the player doesn't own); advice then falls back to
   * the best allowed item. Default allows everything.
   */
  allowItem?: (name: string) => boolean;
}

export interface MemberAdvice {
  rec: PcPokemonRecord;
  p: Pokemon;
  role: Role;
  quality: number;
  /** Curated set the advice is diffed against; null = usage marginals / heuristics. */
  matchedSetName: string | null;
  natureChange: { from: string; to: string } | null;
  evTarget: { current: BaseStats; target: BaseStats } | null;
  itemSuggestion: { current: string | null; suggested: string } | null;
  moveChanges: { teach: string; replace: string | null; reason: string }[];
  /** Deliberately-lowered IVs worth setting (e.g. 0 Atk on a special attacker). */
  ivChanges: { stat: keyof BaseStats; from: number; to: number; reason: string }[];
  needsLeveling: { current: number; target: number } | null;
}

export interface TeamCandidate {
  preset: TeamPresetId;
  label: string;
  score: number;
  breakdown: { quality: number; chemistry: number; defense: number; offense: number; roles: number };
  members: MemberAdvice[];
  /** Types ≥2 members are weak to with no resist on the team. */
  stackedWeaknesses: string[];
  /** Types no member hits super-effectively with STAB. */
  uncoveredTypes: string[];
}

export interface BestSixResult {
  candidates: TeamCandidate[];
  excludedUnderleveled: number;
  /** PC mons dropped for being banned from NatDex OU (when legalOnly). */
  excludedBanned: number;
  /** PC mons dropped for a crippling ability (Slow Start / Truant / Defeatist). */
  excludedDetrimental: number;
  dedupedSpecies: number;
  poolSize: number;
  refLevel: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STAT_ORDER: (keyof BaseStats)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

// Abilities that strictly cripple competitive viability. The zero-usage BST
// taper would otherwise float high-BST mons that carry one of these (Regigigas,
// Slaking, Archeops) into the pool; a heavy multiplier keeps them out.
const DETRIMENTAL_ABILITIES = new Set(['slowstart', 'defeatist', 'truant']);

interface PoolMember {
  rec: PcPokemonRecord;
  p: Pokemon;
  intel: SmogonSpeciesIntel | null;
  matched: MatchedSet | null;
  quality: number;
  role: Role;
  /** Functional roles (hazard-control, win-condition, …) from teamRoles. */
  tags: Set<RoleTag>;
  weakTo: Set<string>;
  resists: Set<string>;
  stabSE: Set<string>;
}

interface PresetWeights {
  q: number;
  c: number;
  d: number;
  o: number;
  r: number;
  /** Max offensive roles before the role-balance penalty kicks in. */
  maxOffense: number;
  bulkBonus: number;
  label: string;
}

const PRESETS: Record<TeamPresetId, PresetWeights> = {
  balanced: { q: 1, c: 1.5, d: 1.2, o: 1, r: 1, maxOffense: 4, bulkBonus: 0.5, label: 'Balanced' },
  offense: { q: 1.1, c: 1.5, d: 0.6, o: 1.8, r: 0.6, maxOffense: 5, bulkBonus: 0.25, label: 'Hyper offense' },
  defense: { q: 1, c: 1.5, d: 2.2, o: 0.5, r: 1.4, maxOffense: 3, bulkBonus: 1, label: 'Defensive core' },
};

function evArrayToStats(arr: number[]): BaseStats {
  const out: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  STAT_ORDER.forEach((k, i) => (out[k] = arr[i] ?? 0));
  return out;
}

function inferRole(member: { p: Pokemon; matched: MatchedSet | null; rec?: PcPokemonRecord }): Role {
  // The player's actual aggressive EV spread overrides everything: heavy Speed +
  // offense investment means an attacker, never a wall, regardless of base bulk.
  const own = member.rec?.evs;
  if (own && (own.spe ?? 0) >= 200 && ((own.atk ?? 0) >= 200 || (own.spa ?? 0) >= 200)) {
    return (own.spa ?? 0) >= (own.atk ?? 0) ? 'special' : 'physical';
  }

  const evs = member.matched?.set.evs;
  if (evs) {
    const [hp, atk, def, spa, spd] = evs;
    if (hp + def + spd >= 380) return 'bulk';
    if (atk >= 128 && spa >= 100) return 'mixed';
    if (atk >= 128) return 'physical';
    if (spa >= 128) return 'special';
  }
  const b = member.p.baseStats;
  if (b.hp + b.def + b.spd > b.atk + b.spa + b.spe) return 'bulk';
  const ratio = b.atk / Math.max(1, b.spa);
  if (ratio > 1.15) return 'physical';
  if (ratio < 0.87) return 'special';
  return 'mixed';
}

function ivQuality(rec: PcPokemonRecord, p: Pokemon): number {
  const attackKey = p.baseStats.atk >= p.baseStats.spa ? 'atk' : 'spa';
  const weighted =
    rec.ivs.spe + rec.ivs.hp + rec.ivs[attackKey] + 0.5 * rec.ivs.def + 0.5 * rec.ivs.spd;
  return weighted / (4 * 31);
}

function percentile90(levels: number[]): number {
  if (!levels.length) return 50;
  const sorted = [...levels].sort((a, b) => a - b);
  return sorted[Math.floor(0.9 * (sorted.length - 1))];
}

// ---------------------------------------------------------------------------
// Objective
// ---------------------------------------------------------------------------

interface TeamEval {
  score: number;
  breakdown: TeamCandidate['breakdown'];
  stacked: string[];
  uncovered: string[];
}

function evaluateTeam(team: PoolMember[], chem: number[][], idx: number[], w: PresetWeights): TeamEval {
  const quality = team.reduce((a, m) => a + m.quality, 0);

  let chemistry = 0;
  for (let i = 0; i < idx.length; i++) {
    for (let j = i + 1; j < idx.length; j++) chemistry += chem[idx[i]][idx[j]];
  }

  const stacked: string[] = [];
  const uncovered: string[] = [];
  let seCount = 0;
  for (const t of TYPES) {
    let weak = 0;
    let resist = 0;
    let se = false;
    for (const m of team) {
      if (m.weakTo.has(t)) weak++;
      if (m.resists.has(t)) resist++;
      if (m.stabSE.has(t)) se = true;
    }
    if (weak >= 2 && resist === 0) stacked.push(t);
    if (se) seCount++;
    else uncovered.push(t);
  }

  const roleCounts: Record<Role, number> = { physical: 0, special: 0, bulk: 0, mixed: 0 };
  for (const m of team) roleCounts[m.role]++;
  let roles = 0;
  if (roleCounts.physical >= 1 && roleCounts.special >= 1) roles += 1;
  roles += Math.min(2, roleCounts.bulk) * w.bulkBonus;
  const offensive = roleCounts.physical + roleCounts.special + roleCounts.mixed;
  if (offensive > w.maxOffense) roles -= 0.5 * (offensive - w.maxOffense);

  // Functional-role coverage: a team wants a way to close games (win condition),
  // a hazard setter, and hazard removal. Penalize structural holes; only a team
  // of 3+ is expected to carry the full backbone.
  const hasTag = (t: RoleTag) => team.some((m) => m.tags.has(t));
  const hasWinCon = hasTag('setup-sweeper') || team.some((m) => bst(m.p.baseStats) >= 500 && m.role !== 'bulk');
  if (team.length >= 3) {
    if (!hasWinCon) roles -= 1;
    if (!hasTag('hazard-control')) roles -= 0.5;
    if (!hasTag('hazard-setter')) roles -= 0.5;
  }

  const breakdown = {
    quality: w.q * quality,
    chemistry: w.c * chemistry,
    // Exponential: a second/third stacked weakness is far worse than the first.
    defense: -w.d * (Math.pow(2, stacked.length) - 1),
    offense: w.o * (seCount / 3),
    roles: w.r * roles,
  };
  const score =
    breakdown.quality + breakdown.chemistry + breakdown.defense + breakdown.offense + breakdown.roles;
  return { score, breakdown, stacked, uncovered };
}

// ---------------------------------------------------------------------------
// Search: greedy seed + steepest-ascent single swaps
// ---------------------------------------------------------------------------

function searchTeam(
  pool: PoolMember[],
  chem: number[][],
  w: PresetWeights,
  banned: Set<number>,
  seed: number[] = [],
): number[] {
  const size = Math.min(6, pool.length - banned.size);
  const inTeam = new Set<number>();
  const idx: number[] = [];

  const evalIdx = (ids: number[]) => evaluateTeam(ids.map((i) => pool[i]), chem, ids, w).score;

  // Pre-place a seed core (e.g. a sweeper+pivot pairing) so the greedy fill and
  // swap phase build the rest of the team around it - a cheap multi-start that
  // escapes the local optima a single greedy seed can fall into.
  for (const i of seed) {
    if (idx.length >= size) break;
    if (i < 0 || i >= pool.length || inTeam.has(i) || banned.has(i)) continue;
    inTeam.add(i);
    idx.push(i);
  }

  // Greedy fill.
  for (let round = idx.length; round < size; round++) {
    let bestI = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      if (inTeam.has(i) || banned.has(i)) continue;
      const s = evalIdx([...idx, i]);
      if (s > bestScore) {
        bestScore = s;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    inTeam.add(bestI);
    idx.push(bestI);
  }

  // Steepest-ascent swaps.
  let current = evalIdx(idx);
  for (let round = 0; round < 8; round++) {
    let bestGain = 0;
    let bestSlot = -1;
    let bestRepl = -1;
    for (let s = 0; s < idx.length; s++) {
      for (let i = 0; i < pool.length; i++) {
        if (inTeam.has(i) || banned.has(i)) continue;
        const trial = [...idx];
        trial[s] = i;
        const v = evalIdx(trial);
        if (v - current > bestGain + 1e-9) {
          bestGain = v - current;
          bestSlot = s;
          bestRepl = i;
        }
      }
    }
    if (bestSlot < 0) break;
    inTeam.delete(idx[bestSlot]);
    inTeam.add(bestRepl);
    idx[bestSlot] = bestRepl;
    current += bestGain;
  }
  return idx;
}

/**
 * Synergy cores to seed the search from. The doc's "build outward from a core"
 * idea, implemented as a cheap multi-start: each seed biases the greedy fill
 * into a different basin, and `bestSearch` keeps whichever finishes strongest
 * (including the empty/default seed, so a seed can never make the result worse).
 */
function coreSeeds(pool: PoolMember[], banned: Set<number>): number[][] {
  const avail = pool.map((_, i) => i).filter((i) => !banned.has(i));
  const byQuality = [...avail].sort((a, b) => pool[b].quality - pool[a].quality);
  const seeds: number[][] = [[]]; // default: pure greedy

  // Role core: a win condition + a wallbreaker + a pivot, best of each by quality.
  const firstWith = (pred: (m: PoolMember) => boolean) => byQuality.find((i) => pred(pool[i]));
  const winCon = firstWith((m) => m.tags.has('setup-sweeper'));
  const breaker = firstWith((m) => bst(m.p.baseStats) >= 500 && m.role !== 'bulk');
  const pivot = firstWith((m) => m.tags.has('pivot'));
  const roleCore = [...new Set([winCon, breaker, pivot].filter((i): i is number => i != null))];
  if (roleCore.length >= 2) seeds.push(roleCore);

  // Defensive core: greedily grow a trio that shares the fewest weaknesses.
  if (avail.length >= 3) {
    const defCore: number[] = [byQuality[0]];
    while (defCore.length < 3) {
      let best = -1;
      let bestStacked = Infinity;
      for (const i of avail) {
        if (defCore.includes(i)) continue;
        const team = [...defCore, i].map((j) => pool[j]);
        let stacked = 0;
        for (const t of TYPES) {
          let weak = 0;
          let resist = 0;
          for (const m of team) {
            if (m.weakTo.has(t)) weak++;
            if (m.resists.has(t)) resist++;
          }
          if (weak >= 2 && resist === 0) stacked++;
        }
        if (stacked < bestStacked) {
          bestStacked = stacked;
          best = i;
        }
      }
      if (best < 0) break;
      defCore.push(best);
    }
    if (defCore.length >= 3) seeds.push(defCore);
  }

  return seeds;
}

/** Run the search from every core seed and keep the highest-scoring team. */
function bestSearch(
  pool: PoolMember[],
  chem: number[][],
  w: PresetWeights,
  banned: Set<number>,
): number[] {
  let best: number[] = [];
  let bestScore = -Infinity;
  for (const seed of coreSeeds(pool, banned)) {
    const idx = searchTeam(pool, chem, w, banned, seed);
    if (idx.length === 0) continue;
    const score = evaluateTeam(idx.map((i) => pool[i]), chem, idx, w).score;
    if (score > bestScore) {
      bestScore = score;
      best = idx;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Advice
// ---------------------------------------------------------------------------

function buildAdvice(
  member: PoolMember,
  refLevel: number,
  moves: Record<string, Move>,
  allowItem: (name: string) => boolean = () => true,
): MemberAdvice {
  const { rec, p, intel, matched } = member;

  // Optimization target: the closest curated set, else a pseudo-set from the
  // usage marginals, else nothing beyond leveling advice.
  let targetName: string | null = null;
  let targetNature: string | null = null;
  let targetEvs: BaseStats | null = null;
  let targetItem: string | null = null;
  let targetMoves: string[] = [];
  let reason = '';

  if (matched) {
    targetName = matched.name;
    targetNature = matched.set.nature;
    targetEvs = evArrayToStats(matched.set.evs);
    // Prefer the set's first item the player can actually use (skips an unowned
    // Mega Stone / Z-Crystal in favour of the next slash option).
    targetItem = matched.set.item.find((it) => allowItem(it)) ?? null;
    targetMoves = matched.moves;
    reason = `Smogon "${matched.name}"`;
  } else if (intel) {
    const spread = intel.spreads[0];
    targetNature = spread?.nature ?? null;
    targetEvs = spread ? evArrayToStats(spread.evs) : null;
    targetItem = intel.items
      .map((i) => i.name)
      .find((name) => name !== 'No item' && allowItem(name)) ?? null;
    const canLearn = new Set(p.moves.map((m) => m.move));
    targetMoves = intel.moves
      .filter((m) => canLearn.has(norm(m.name)))
      .slice(0, 4)
      .map((m) => m.name);
    reason = 'ladder usage';
  }

  const natureChange =
    targetNature && norm(targetNature) !== norm(rec.nature)
      ? { from: rec.nature, to: targetNature }
      : null;

  let evTarget: MemberAdvice['evTarget'] = null;
  if (targetEvs) {
    const l1 = STAT_ORDER.reduce((a, k) => a + Math.abs((rec.evs[k] ?? 0) - targetEvs![k]), 0);
    if (l1 > 64) evTarget = { current: { ...rec.evs }, target: targetEvs };
  }

  const itemSuggestion =
    targetItem && norm(targetItem) !== norm(rec.item ?? '')
      ? { current: rec.item, suggested: targetItem }
      : null;

  // Moves: teach what the target runs and the mon doesn't know; replace the
  // weakest current move not in the target.
  const ownNorm = new Set(rec.moves.map(norm));
  const targetNorm = new Set(targetMoves.map(norm));
  const teaches = targetMoves.filter((m) => !ownNorm.has(norm(m)));
  const replaceable = rec.moves
    .filter((m) => !targetNorm.has(norm(m)))
    .map((name) => {
      const mv = moves[norm(name)];
      return { name, score: mv ? scoreMove(p, mv, intel).score : 0 };
    })
    .sort((a, b) => a.score - b.score);
  const moveChanges = teaches.slice(0, 4).map((teach, i) => ({
    teach,
    replace: rec.moves.length >= 4 ? (replaceable[i]?.name ?? null) : null,
    reason,
  }));

  const ivChanges = buildIvChanges(member, targetMoves);

  const needsLeveling =
    rec.level < Math.round(0.9 * refLevel) ? { current: rec.level, target: refLevel } : null;

  return {
    rec,
    p,
    role: member.role,
    quality: Math.round(member.quality * 100) / 100,
    matchedSetName: targetName,
    natureChange,
    evTarget,
    itemSuggestion,
    moveChanges,
    ivChanges,
    needsLeveling,
  };
}

const IV_REASONS: Partial<Record<keyof BaseStats, string>> = {
  atk: 'cuts Foul Play & confusion self-damage',
  spe: 'underspeed for Trick Room / Gyro Ball',
  hp: 'tunes Life Orb / hazard math',
};

/**
 * Deliberately-lowered IVs worth setting. Driven first by the matched curated
 * set (which encodes things like 0 Atk), then a couple of robust heuristics:
 * a purely special attacker wants 0 Atk, and a Trick Room / Gyro Ball user
 * wants 0 Spe.
 */
function buildIvChanges(
  member: PoolMember,
  targetMoves: string[],
): MemberAdvice['ivChanges'] {
  const { rec, matched, role, p } = member;
  const out: MemberAdvice['ivChanges'] = [];
  const seen = new Set<keyof BaseStats>();
  const add = (stat: keyof BaseStats, to: number) => {
    const from = rec.ivs[stat] ?? 31;
    if (seen.has(stat) || from <= to) return;
    seen.add(stat);
    out.push({ stat, from, to, reason: IV_REASONS[stat] ?? `set to ${to}` });
  };

  // From the curated set's IV spread (any stat intentionally < 31).
  if (matched?.set.ivs) {
    STAT_ORDER.forEach((stat, i) => {
      const target = matched.set.ivs![i];
      if (target != null && target < 31) add(stat, target);
    });
  }

  // Special attacker (by inferred role / stat shape) -> 0 Atk. If the curated set
  // already addressed Atk this is a no-op via `seen`.
  if (role === 'special' || (role !== 'physical' && role !== 'mixed' && p.baseStats.spa > p.baseStats.atk)) {
    add('atk', 0);
  }

  // Trick Room / Gyro Ball want minimum Speed.
  const movesNorm = new Set([...rec.moves, ...targetMoves].map(norm));
  if (movesNorm.has('trickroom') || movesNorm.has('gyroball')) add('spe', 0);

  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function buildBestTeams(
  records: PcPokemonRecord[],
  pokemonById: Record<string, Pokemon>,
  moves: Record<string, Move>,
  smogon: SmogonBundle | null,
  opts: BestSixOptions = {},
): BestSixResult {
  const presets = opts.presets ?? (['balanced', 'offense', 'defense'] as TeamPresetId[]);
  const poolLimit = opts.poolSize ?? 30;
  const minLevelRatio = opts.minLevelRatio ?? 0.6;
  const legalOnly = opts.legalOnly ?? true;
  const allowItem = opts.allowItem ?? (() => true);

  // Drop banned (Uber/AG) mons first so the team is NatDex OU-legal, and mons
  // whose ability strictly cripples them (Slow Start / Truant / Defeatist) -
  // their raw stats would otherwise float them into a "best" team.
  let excludedBanned = 0;
  let excludedDetrimental = 0;
  const known = records.filter((r) => {
    const p = pokemonById[r.speciesId];
    if (!p) return false;
    if (legalOnly && !isNatDexOULegal(p)) {
      excludedBanned++;
      return false;
    }
    if (DETRIMENTAL_ABILITIES.has(norm(r.ability))) {
      excludedDetrimental++;
      return false;
    }
    return true;
  });
  const refLevel = opts.refLevel ?? percentile90(known.map((r) => r.level));
  const minLevel = refLevel * minLevelRatio;

  let excludedUnderleveled = 0;
  const eligible = known.filter((r) => {
    if (r.level < minLevel) {
      excludedUnderleveled++;
      return false;
    }
    return true;
  });

  // Best record per species (duplicates never improve a team of 6).
  const bySpecies = new Map<string, PcPokemonRecord>();
  for (const r of eligible) {
    const prev = bySpecies.get(r.speciesId);
    if (!prev || r.level > prev.level) bySpecies.set(r.speciesId, r);
  }
  const dedupedSpecies = eligible.length - bySpecies.size;

  // Build + rank pool members.
  const members: PoolMember[] = [...bySpecies.values()].map((rec) => {
    const p = pokemonById[rec.speciesId];
    const intel = smogon?.species[rec.speciesId] ?? null;
    const matched = intel ? bestMatchingSet(rec, p, intel) : null;
    const usage = intel?.usage ?? 0;
    // BST is tapered by usage: for meta mons, ladder usage already reflects stat
    // quality (counting both double-counts it), but for the many off-ladder
    // Cobblemon species (usage 0) BST is the only power signal we have.
    const bstWeight = 0.5 * (1 - Math.min(1, Math.sqrt(usage)));
    const quality =
      Math.sqrt(usage) +
      bstWeight * (bst(p.baseStats) / 600) +
      0.5 * Math.min(1, rec.level / Math.max(1, refLevel)) +
      0.5 * ivQuality(rec, p);

    const weakTo = new Set<string>();
    const resists = new Set<string>();
    const stabSE = new Set<string>();
    for (const t of TYPES) {
      const mult = effectiveness(t, p.types);
      if (mult > 1) weakTo.add(t);
      else if (mult < 1) resists.add(t);
      if (p.types.some((stab) => effectiveness(stab, [t]) >= 2)) stabSE.add(t);
    }

    // EVs are forwarded so classifyMember's role read honours an aggressive
    // offensive spread (it ignores IVs/level).
    const detail: MemberDetail = {
      item: rec.item, ability: rec.ability || null, nature: rec.nature,
      level: rec.level, ivs: null, evs: rec.evs as unknown as Record<string, number>, moves: rec.moves,
    };
    const tags = new Set(classifyMember(p, detail, intel, moves).tags);

    const base = { rec, p, intel, matched, quality, tags, weakTo, resists, stabSE };
    return { ...base, role: inferRole(base) };
  });

  members.sort((a, b) => b.quality - a.quality);
  const pool = members.slice(0, poolLimit);

  // Pairwise chemistry from Smogon teammate co-usage.
  const chem: number[][] = pool.map(() => pool.map(() => 0));
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const aToB = pool[i].intel?.teammates.find((t) => t.id === pool[j].rec.speciesId)?.pct ?? 0;
      const bToA = pool[j].intel?.teammates.find((t) => t.id === pool[i].rec.speciesId)?.pct ?? 0;
      const v = Math.min(1, Math.max(aToB, bToA) / 30);
      chem[i][j] = v;
      chem[j][i] = v;
    }
  }

  // One candidate per preset, with a diversity guard against near-duplicates.
  const candidates: TeamCandidate[] = [];
  const seenTeams: Set<number>[] = [];
  for (const presetId of presets) {
    if (pool.length === 0) break;
    const w = PRESETS[presetId];
    let idx = bestSearch(pool, chem, w, new Set());

    const overlapWith = (ids: number[]) => {
      let best = 0;
      for (const prev of seenTeams) {
        const o = ids.filter((i) => prev.has(i)).length;
        if (o > best) best = o;
      }
      return best;
    };
    if (idx.length === 6 && overlapWith(idx) >= 5) {
      // Ban the highest-quality shared member and retry once for variety.
      const shared = idx.filter((i) => seenTeams.some((s) => s.has(i)));
      const ban = shared.sort((a, b) => pool[b].quality - pool[a].quality)[0];
      const retry = bestSearch(pool, chem, w, new Set([ban]));
      if (retry.length === idx.length && overlapWith(retry) < overlapWith(idx)) idx = retry;
    }
    if (idx.length === 0) continue;
    // Honest duplicate-drop: identical to an earlier candidate -> skip.
    const key = new Set(idx);
    if (seenTeams.some((s) => s.size === key.size && idx.every((i) => s.has(i)))) continue;
    seenTeams.push(key);

    const team = idx.map((i) => pool[i]);
    const ev = evaluateTeam(team, chem, idx, w);
    candidates.push({
      preset: presetId,
      label: w.label,
      score: Math.round(ev.score * 100) / 100,
      breakdown: {
        quality: Math.round(ev.breakdown.quality * 100) / 100,
        chemistry: Math.round(ev.breakdown.chemistry * 100) / 100,
        defense: Math.round(ev.breakdown.defense * 100) / 100,
        offense: Math.round(ev.breakdown.offense * 100) / 100,
        roles: Math.round(ev.breakdown.roles * 100) / 100,
      },
      members: team.map((m) => buildAdvice(m, refLevel, moves, allowItem)),
      stackedWeaknesses: ev.stacked,
      uncoveredTypes: ev.uncovered,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, excludedUnderleveled, excludedBanned, excludedDetrimental, dedupedSpecies, poolSize: pool.length, refLevel };
}

// Keep learnableMoves referenced for advice extensions (and silence TS unused).
export const __internals__ = { evaluateTeam, inferRole, ivQuality, percentile90, learnableMoves };
