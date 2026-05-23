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
import type { PcPokemonRecord } from './bridgeTypes';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';
import { TYPES, effectiveness } from './typechart';
import { bst, calcAllStats } from './stats';
import { learnableMoves, scoreMove } from './recommender';
import { bestMatchingSet, type MatchedSet } from './smogonSets';

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
  dedupedSpecies: number;
  poolSize: number;
  refLevel: number;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STAT_ORDER: (keyof BaseStats)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

interface PoolMember {
  rec: PcPokemonRecord;
  p: Pokemon;
  intel: SmogonSpeciesIntel | null;
  matched: MatchedSet | null;
  quality: number;
  role: Role;
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

function inferRole(member: { p: Pokemon; matched: MatchedSet | null }): Role {
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

  const breakdown = {
    quality: w.q * quality,
    chemistry: w.c * chemistry,
    defense: -w.d * stacked.length,
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
): number[] {
  const size = Math.min(6, pool.length - banned.size);
  const inTeam = new Set<number>();
  const idx: number[] = [];

  const evalIdx = (ids: number[]) => evaluateTeam(ids.map((i) => pool[i]), chem, ids, w).score;

  // Greedy seed.
  for (let round = 0; round < size; round++) {
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

// ---------------------------------------------------------------------------
// Advice
// ---------------------------------------------------------------------------

function buildAdvice(
  member: PoolMember,
  refLevel: number,
  moves: Record<string, Move>,
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
    targetItem = matched.set.item[0] ?? null;
    targetMoves = matched.moves;
    reason = `Smogon "${matched.name}"`;
  } else if (intel) {
    const spread = intel.spreads[0];
    targetNature = spread?.nature ?? null;
    targetEvs = spread ? evArrayToStats(spread.evs) : null;
    targetItem = intel.items[0]?.name === 'No item' ? null : (intel.items[0]?.name ?? null);
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
    needsLeveling,
  };
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
  const poolLimit = opts.poolSize ?? 24;
  const minLevelRatio = opts.minLevelRatio ?? 0.6;

  const known = records.filter((r) => pokemonById[r.speciesId]);
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
    const quality =
      Math.sqrt(usage) +
      0.5 * (bst(p.baseStats) / 600) +
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

    const base = { rec, p, intel, matched, quality, weakTo, resists, stabSE };
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
    let idx = searchTeam(pool, chem, w, new Set());

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
      const retry = searchTeam(pool, chem, w, new Set([ban]));
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
      members: team.map((m) => buildAdvice(m, refLevel, moves)),
      stackedWeaknesses: ev.stacked,
      uncoveredTypes: ev.uncovered,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return { candidates, excludedUnderleveled, dedupedSpecies, poolSize: pool.length, refLevel };
}

// Keep learnableMoves referenced for advice extensions (and silence TS unused).
export const __internals__ = { evaluateTeam, inferRole, ivQuality, percentile90, learnableMoves };
