/**
 * Team building with the team model: a beam search over the box (legal,
 * levelled Pokémon only, from bestSix's pool) for the highest meta score,
 * then single swaps, then three different teams. Each comes with what every
 * member adds, the meta teams it struggles with, and the species outside the
 * box that would raise its score most.
 */
import type { Pokemon } from './types';
import type { SmogonBundle } from './smogon';
import { candidateFor, type BoxPool, type PoolMember, type TeamCandidate } from './bestSix';
import type { Move } from './types';
import type { TeamMon, TeamScorer } from '../ml/teamModel';

export interface ModelCandidate extends TeamCandidate {
  /** Mean win chance against the meta teams, 0 to 1. */
  metaScore: number;
  /** Meta score lost without each member, in member order. */
  contributions: number[];
  /** The meta teams this team does worst against. */
  worst: { species: string[]; win: number }[];
}

export interface AddSuggestion {
  p: Pokemon;
  gain: number;
  /** The member it would replace. */
  replaces: string;
}

export interface ModelSearchResult {
  candidates: ModelCandidate[];
  addList: AddSuggestion[];
  month: string;
}

export interface SearchOptions {
  /** Teams kept at each step of the beam. */
  width: number;
  /** Meta teams scored during the search; results use all of them. */
  sample: number;
  onProgress?: (text: string) => void;
}

const DEFAULTS: SearchOptions = { width: 32, sample: 40 };

export function teamMon(m: PoolMember): TeamMon {
  const r = m.rec;
  return { species: m.p.id, base: m.p.baseSpecies, item: r.item, ability: r.ability, moves: r.moves };
}

const key = (idx: number[]) => [...idx].sort((a, b) => a - b).join(',');

function label(team: PoolMember[]): string {
  const bulky = team.filter((m) => m.role === 'bulk').length;
  if (bulky >= 3) return 'Bulky';
  return bulky <= 1 ? 'Offense' : 'Balance';
}

export async function searchTeams(
  box: BoxPool,
  scorer: TeamScorer,
  moves: Record<string, Move>,
  allowItem: (name: string) => boolean,
  outside: Pokemon[],
  options: Partial<SearchOptions> = {},
): Promise<ModelSearchResult | null> {
  const o = { ...DEFAULTS, ...options };
  const pool = box.pool;
  const mons = pool.map(teamMon);
  const baseOf = (i: number) => pool[i].p.baseSpecies ?? pool[i].p.name;
  const score = async (teams: number[][], sample = o.sample) => scorer.metaScores(teams.map((t) => t.map((i) => mons[i])), sample);

  let beam: { idx: number[]; s: number }[] = [{ idx: [], s: 0 }];
  for (let size = 1; size <= Math.min(6, pool.length); size++) {
    o.onProgress?.(`Searching teams of ${size}...`);
    const seen = new Set<string>();
    const next: number[][] = [];
    for (const { idx } of beam) {
      const bases = new Set(idx.map(baseOf));
      for (let c = 0; c < pool.length; c++) {
        if (idx.includes(c) || bases.has(baseOf(c))) continue;
        const t = [...idx, c];
        const k = key(t);
        if (!seen.has(k)) {
          seen.add(k);
          next.push(t);
        }
      }
    }
    if (!next.length) break;
    const scores = await score(next);
    if (!scores) return null;
    beam = next.map((idx, i) => ({ idx, s: scores[i] })).sort((a, b) => b.s - a.s).slice(0, o.width);
  }

  // Single swaps on the best few.
  o.onProgress?.('Trying swaps...');
  for (const entry of beam.slice(0, 3)) {
    for (let round = 0; round < 3; round++) {
      const swaps: number[][] = [];
      entry.idx.forEach((_, slot) => {
        const others = entry.idx.filter((_, j) => j !== slot);
        const bases = new Set(others.map(baseOf));
        for (let c = 0; c < pool.length; c++) {
          if (!entry.idx.includes(c) && !bases.has(baseOf(c))) swaps.push(entry.idx.map((x, j) => (j === slot ? c : x)));
        }
      });
      const scores = swaps.length ? await score(swaps) : [];
      if (!scores) return null;
      const bestSwap = scores.reduce((b, s, i) => (s > b.s ? { s, i } : b), { s: entry.s, i: -1 });
      if (bestSwap.i < 0) break;
      entry.idx = swaps[bestSwap.i];
      entry.s = bestSwap.s;
    }
  }

  // Three different teams, scored against the whole meta.
  o.onProgress?.('Scoring against the meta...');
  const unique = [...new Map(beam.map((e) => [key(e.idx), e])).values()].slice(0, 16);
  const full = await score(unique.map((e) => e.idx), scorer.metaTeams.length);
  if (!full) return null;
  const ranked = unique.map((e, i) => ({ idx: e.idx, s: full[i] })).sort((a, b) => b.s - a.s);
  const picked: typeof ranked = [];
  for (const e of ranked) {
    if (picked.length >= 3) break;
    if (picked.every((p) => e.idx.filter((i) => p.idx.includes(i)).length <= 4)) picked.push(e);
  }

  const candidates: ModelCandidate[] = [];
  for (const [n, e] of picked.entries()) {
    const team = e.idx.map((i) => pool[i]);
    const without = await score(e.idx.map((_, j) => e.idx.filter((__, k) => k !== j)), scorer.metaTeams.length);
    const vsMeta = await scorer.winChances(scorer.metaTeams.map((m) => [team.map(teamMon), m] as [TeamMon[], TeamMon[]]));
    if (!without || !vsMeta) return null;
    const worst = vsMeta
      .map((win, i) => ({ win, species: scorer.metaTeams[i].map((m) => m.species) }))
      .sort((a, b) => a.win - b.win)
      .slice(0, 3);
    const base = candidateFor(box, e.idx, n === 0 ? 'balanced' : n === 1 ? 'offense' : 'defense', label(team), moves, allowItem);
    candidates.push({ ...base, score: Math.round(1000 * e.s) / 10, metaScore: e.s, contributions: without.map((w) => e.s - w), worst });
  }

  // Species from outside the box that would raise the best team's score most.
  o.onProgress?.('Looking for additions...');
  const best = picked[0];
  const addList: AddSuggestion[] = [];
  if (best) {
    const inBox = new Set(pool.map((m) => m.p.baseSpecies ?? m.p.name));
    const options = outside.filter((p) => !inBox.has(p.baseSpecies ?? p.name)).slice(0, 40);
    const teams: TeamMon[][] = [];
    const meta: { p: Pokemon; slot: number }[] = [];
    for (const p of options) {
      best.idx.forEach((_, slot) => {
        teams.push(best.idx.map((i, j) => (j === slot ? { species: p.id, base: p.baseSpecies } : mons[i])));
        meta.push({ p, slot });
      });
    }
    const scores = teams.length ? await scorer.metaScores(teams, Math.min(100, scorer.metaTeams.length)) : [];
    const baseline = await score([best.idx], Math.min(100, scorer.metaTeams.length));
    if (scores && baseline) {
      const bySpecies = new Map<string, AddSuggestion>();
      scores.forEach((s, i) => {
        const { p, slot } = meta[i];
        const gain = s - baseline[0];
        const prev = bySpecies.get(p.id);
        if (gain > 0 && (!prev || gain > prev.gain)) bySpecies.set(p.id, { p, gain, replaces: pool[best.idx[slot]].p.name });
      });
      addList.push(...[...bySpecies.values()].sort((a, b) => b.gain - a.gain).slice(0, 5));
    }
  }
  return { candidates, addList, month: scorer.month };
}

/** The format's most used legal species, for the add list. */
export function usageSpecies(smogon: SmogonBundle | null, pokemonById: Record<string, Pokemon>): Pokemon[] {
  if (!smogon) return [];
  return Object.entries(smogon.species)
    .sort((a, b) => b[1].usage - a[1].usage)
    .flatMap(([id]) => (pokemonById[id] && !pokemonById[id].banned ? [pokemonById[id]] : []));
}
