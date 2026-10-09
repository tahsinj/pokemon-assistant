/**
 * Draft a counter-team from the user's PC against a known opponent team.
 *
 * Every candidate gets a chance to beat every opponent one on one: from the
 * matchup model when the page has one (`wins`), otherwise from the calc
 * rules in matchup.ts. The pick is greedy plus single swaps over a team
 * value that rewards a strong answer to each opponent (weighted by how hard
 * that opponent is for the whole box), backup answers, and penalizes members
 * that all lose to the same opponent.
 *
 * `evaluateTeam` re-scores a fixed team under a given bulk tier, used when
 * the user flips the assumption tabs without re-drafting. Pure: the evaluator
 * is injectable so selection and scoring are tested without the real calc.
 */
import type { Pokemon, Move } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import type { SmogonBundle } from './smogon';
import { evaluateMatchup, matchupSpecs, opponentAbility, type MatchupCell } from './matchup';
import type { BattlePokemonSpec } from './battle/types';
import { assumedOpponentSpec, type AssumedSet, type OpponentBulk } from './opponentSet';

export interface Candidate { rec: PcPokemonRecord; p: Pokemon; }
export interface OpponentEntry {
  p: Pokemon;
  level: number;
  /** Tera type the opponent terastallizes into (format-gated); null/undefined = no Tera. */
  teraType?: string | null;
}
interface OppSet extends OpponentEntry { set: AssumedSet; assumedAbility: string | null; }

export interface ThreatAnswer { oppId: string; oppName: string; pcId: string | null; pcName: string | null; cell: MatchupCell | null; }
export interface DraftTips {
  lead: { id: string; name: string; outspeeds: number } | null;
  winCondition: { id: string; name: string; score: number } | null;
  biggestHole: { oppId: string; oppName: string; bestVerdict: MatchupCell['verdict'] | 'none' } | null;
  perThreat: ThreatAnswer[];
}
export interface DraftResult {
  team: Candidate[];
  matrix: MatchupCell[][];
  oppOrder: OpponentEntry[];
  tips: DraftTips;
}

type Evaluator = (pc: Candidate, opp: OppSet, moves: Record<string, Move>) => MatchupCell;

/** wins[i][j]: the chance candidate (or team member) i beats opponent j one on one. */
export type WinMatrix = number[][];

const VERDICT_RANK: Record<MatchupCell['verdict'], number> = { win: 2, trade: 1, lose: 0 };

/** The calc rules' verdict as a win chance, for when no model is available. */
export function cellWin(cell: MatchupCell): number {
  const base = cell.verdict === 'win' ? 0.75 : cell.verdict === 'trade' ? 0.5 : 0.25;
  return Math.max(0.05, Math.min(0.95, base + Math.max(-0.15, Math.min(0.15, cell.score / 600))));
}

/** A cell restated from a model's win chance; the calc details stay as the explanation. */
function withWin(cell: MatchupCell, win: number): MatchupCell {
  const verdict = win >= 0.6 ? 'win' : win >= 0.4 ? 'trade' : 'lose';
  return { ...cell, verdict, score: Math.round(100 * (win - 0.5)), win };
}

const LOSING = 0.35;
const SHARED_WEAKNESS = 0.6;

/** How good a team is against the opponents, given each member's win chances (rows of `wins`). */
export function teamValue(rows: number[][], threat: number[]): number {
  let value = 0;
  threat.forEach((w, o) => {
    const col = rows.map((r) => r[o]).sort((a, b) => b - a);
    const losing = rows.length ? col.filter((p) => p < LOSING).length / rows.length : 0;
    value += w * ((col[0] ?? 0) + 0.35 * (col[1] ?? 0) + 0.15 * (col[2] ?? 0) - SHARED_WEAKNESS * losing * losing);
  });
  return value;
}

/** Indices of the drafted team: greedy additions while they help, then single swaps. */
export function pickTeam(wins: WinMatrix, teamSize: number): number[] {
  if (!wins.length) return [];
  const nOpp = wins[0].length;
  // Opponents the box struggles with count for more.
  const threat = Array.from({ length: nOpp }, (_, o) => 0.5 + (1 - wins.reduce((s, r) => s + r[o], 0) / wins.length));
  const value = (idx: number[]) => teamValue(idx.map((i) => wins[i]), threat);
  const team: number[] = [];
  while (team.length < teamSize) {
    let best = -1;
    let bestValue = team.length ? value(team) : -Infinity;
    for (let c = 0; c < wins.length; c++) {
      if (team.includes(c)) continue;
      const v = value([...team, c]);
      if (v > bestValue + 1e-9) {
        best = c;
        bestValue = v;
      }
    }
    if (best < 0) break;
    team.push(best);
  }
  for (let improved = true, rounds = 0; improved && rounds < 20; rounds++) {
    improved = false;
    const current = value(team);
    for (let t = 0; t < team.length && !improved; t++) {
      for (let c = 0; c < wins.length; c++) {
        if (team.includes(c)) continue;
        const next = team.map((x, i) => (i === t ? c : x));
        if (value(next) > current + 1e-9) {
          team.splice(0, team.length, ...next);
          improved = true;
          break;
        }
      }
    }
  }
  return team;
}

function buildOppSets(opponents: OpponentEntry[], moves: Record<string, Move>, smogon: SmogonBundle | null, bulk: OpponentBulk): OppSet[] {
  return opponents.map((o) => {
    const set = assumedOpponentSpec(o.p, o.level, smogon?.species[o.p.id] ?? null, moves, bulk);
    return { ...o, set, assumedAbility: opponentAbility(o.p, set.ability, bulk) };
  });
}

function buildTips(team: Candidate[], oppSets: OppSet[], matrix: MatchupCell[][]): DraftTips {
  let lead: DraftTips['lead'] = null;
  let winCondition: DraftTips['winCondition'] = null;
  team.forEach((t, ri) => {
    const os = matrix[ri].filter((c) => c.iAmFaster).length;
    if (!lead || os > lead.outspeeds) lead = { id: t.p.id, name: t.p.name, outspeeds: os };
    const s = matrix[ri].reduce((a, c) => a + c.score, 0);
    if (!winCondition || s > winCondition.score) winCondition = { id: t.p.id, name: t.p.name, score: s };
  });

  const perThreat: ThreatAnswer[] = oppSets.map((o, oi) => {
    let bestRow = -1;
    let bestCell: MatchupCell | null = null;
    matrix.forEach((row, ri) => {
      const c = row[oi];
      if (!bestCell || VERDICT_RANK[c.verdict] > VERDICT_RANK[bestCell.verdict] ||
          (VERDICT_RANK[c.verdict] === VERDICT_RANK[bestCell.verdict] && c.score > bestCell.score)) {
        bestCell = c; bestRow = ri;
      }
    });
    return {
      oppId: o.p.id, oppName: o.p.name,
      pcId: bestRow >= 0 ? team[bestRow].p.id : null,
      pcName: bestRow >= 0 ? team[bestRow].p.name : null,
      cell: bestCell,
    };
  });

  let biggestHole: DraftTips['biggestHole'] = null;
  perThreat.forEach((t) => {
    const v = t.cell?.verdict ?? 'lose';
    const rank = t.cell ? VERDICT_RANK[v] : -1;
    const curRank = biggestHole ? (biggestHole.bestVerdict === 'none' ? -1 : VERDICT_RANK[biggestHole.bestVerdict]) : Infinity;
    if (rank < curRank) biggestHole = { oppId: t.oppId, oppName: t.oppName, bestVerdict: t.cell ? v : 'none' };
  });

  return { lead, winCondition, biggestHole, perThreat };
}

/** Calc inputs for every candidate against every opponent, for the matchup model. */
export function matchupPairs(
  candidates: Candidate[],
  opponents: OpponentEntry[],
  moves: Record<string, Move>,
  smogon: SmogonBundle | null,
  bulk: OpponentBulk = 'maxIv',
): [BattlePokemonSpec, BattlePokemonSpec][][] {
  const oppSets = buildOppSets(opponents, moves, smogon, bulk);
  return candidates.map((c) =>
    oppSets.map((o) => {
      const { me, them } = matchupSpecs(c, o, moves);
      return [me, them] as [BattlePokemonSpec, BattlePokemonSpec];
    }),
  );
}

/**
 * Re-score a fixed team under a bulk tier; matrix rows align with `team`.
 * `wins` (rows aligned with `team`) comes from the matchup model when there
 * is one.
 */
export function evaluateTeam(
  team: Candidate[],
  opponents: OpponentEntry[],
  moves: Record<string, Move>,
  smogon: SmogonBundle | null,
  bulk: OpponentBulk = 'maxIv',
  evaluate: Evaluator = evaluateMatchup,
  wins?: WinMatrix,
): { matrix: MatchupCell[][]; oppOrder: OpponentEntry[]; tips: DraftTips } {
  const oppSets = buildOppSets(opponents, moves, smogon, bulk);
  const matrix = team.map((c, ti) =>
    oppSets.map((o, oi) => {
      const cell = evaluate(c, o, moves);
      return wins ? withWin(cell, wins[ti][oi]) : { ...cell, win: cellWin(cell) };
    }),
  );
  return { matrix, oppOrder: opponents, tips: buildTips(team, oppSets, matrix) };
}

export function draftCounterTeam(
  opponents: OpponentEntry[],
  candidates: Candidate[],
  moves: Record<string, Move>,
  smogon: SmogonBundle | null,
  bulk: OpponentBulk = 'maxIv',
  evaluate: Evaluator = evaluateMatchup,
  teamSize = 6,
  wins?: WinMatrix,
): DraftResult {
  const oppSets = buildOppSets(opponents, moves, smogon, bulk);
  const matrix = wins ?? candidates.map((c) => oppSets.map((o) => cellWin(evaluate(c, o, moves))));
  const chosen = pickTeam(matrix, teamSize);
  const team = chosen.map((ci) => candidates[ci]);
  return { team, ...evaluateTeam(team, opponents, moves, smogon, bulk, evaluate, wins && chosen.map((ci) => wins[ci])) };
}
