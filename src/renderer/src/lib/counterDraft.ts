/**
 * Draft a counter-team from the user's PC against a known opponent team.
 * Coverage-first greedy selection (option C): guarantee every opponent threat
 * an answer where possible, aggregate matchup score as tiebreak / fill.
 *
 * `evaluateTeam` re-scores a *fixed* team under a given bulk tier - used when
 * the user flips the assumption tabs without re-drafting. Pure - the evaluator
 * is injectable so selection/scoring are tested without the real calc.
 */
import type { Pokemon, Move } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import type { SmogonBundle } from './smogon';
import { evaluateMatchup, opponentAbility, type MatchupCell } from './matchup';
import { assumedOpponentSpec, type AssumedSet, type OpponentBulk } from './opponentSet';

export interface Candidate { rec: PcPokemonRecord; p: Pokemon; }
export interface OpponentEntry {
  p: Pokemon;
  level: number;
  /** Tera type the opponent terastallizes into (format-gated); null/undefined = no Tera. */
  teraType?: string | null;
  /** Whether the opponent Dynamaxes (doubles HP). */
  dynamax?: boolean;
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

const VERDICT_RANK: Record<MatchupCell['verdict'], number> = { win: 2, trade: 1, lose: 0 };

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

/** Re-score a FIXED team under a bulk tier - matrix rows align with `team`. */
export function evaluateTeam(
  team: Candidate[],
  opponents: OpponentEntry[],
  moves: Record<string, Move>,
  smogon: SmogonBundle | null,
  bulk: OpponentBulk = 'maxIv',
  evaluate: Evaluator = evaluateMatchup,
): { matrix: MatchupCell[][]; oppOrder: OpponentEntry[]; tips: DraftTips } {
  const oppSets = buildOppSets(opponents, moves, smogon, bulk);
  const matrix = team.map((c) => oppSets.map((o) => evaluate(c, o, moves)));
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
): DraftResult {
  const oppSets = buildOppSets(opponents, moves, smogon, bulk);
  const fullMatrix: MatchupCell[][] = candidates.map((c) => oppSets.map((o) => evaluate(c, o, moves)));

  const nOpp = opponents.length;
  const chosenIdx: number[] = [];
  const covered = new Array<boolean>(nOpp).fill(false);
  const sumScore = (ci: number) => fullMatrix[ci].reduce((a, cell) => a + cell.score, 0);

  const coverPass = (floor: number) => {
    let progress = true;
    while (chosenIdx.length < teamSize && progress) {
      progress = false;
      let best = -1, bestNew = 0, bestScore = -Infinity;
      for (let ci = 0; ci < candidates.length; ci++) {
        if (chosenIdx.includes(ci)) continue;
        let newCov = 0;
        for (let oi = 0; oi < nOpp; oi++) {
          if (!covered[oi] && VERDICT_RANK[fullMatrix[ci][oi].verdict] >= floor) newCov++;
        }
        if (newCov === 0) continue;
        const s = sumScore(ci);
        if (newCov > bestNew || (newCov === bestNew && s > bestScore)) { best = ci; bestNew = newCov; bestScore = s; }
      }
      if (best >= 0) {
        chosenIdx.push(best);
        for (let oi = 0; oi < nOpp; oi++) {
          if (VERDICT_RANK[fullMatrix[best][oi].verdict] >= floor) covered[oi] = true;
        }
        progress = true;
      }
    }
  };

  coverPass(VERDICT_RANK.win);
  coverPass(VERDICT_RANK.trade);

  if (chosenIdx.length < teamSize) {
    const rest = candidates
      .map((_, ci) => ci)
      .filter((ci) => !chosenIdx.includes(ci) && sumScore(ci) > 0)
      .sort((a, b) => sumScore(b) - sumScore(a));
    for (const ci of rest) {
      if (chosenIdx.length >= teamSize) break;
      chosenIdx.push(ci);
    }
  }

  const team = chosenIdx.map((ci) => candidates[ci]);
  return { team, ...evaluateTeam(team, opponents, moves, smogon, bulk, evaluate) };
}
