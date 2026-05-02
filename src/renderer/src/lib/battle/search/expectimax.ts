/**
 * Expectimax search + Explanation builder.
 *
 * - Top-level: enumerate the player's legal actions. For each, marginalize
 *   over the top-K opponent set hypotheses and
 *   pick the opponent's best response under that set. Simulate the turn
 *   pair and evaluate.
 * - Depth 2 adds a second turn pair where the player picks their max
 *   response, the opponent again best-responds.
 *
 * Each returned `Recommendation` now carries a
 * `threatAnalysis`, structured `assumptions[]`, a `principalVariation[]`, a
 * `confidence` score, and (on the top pick) `alternatives[]` summarizing the
 * runner-up actions and why they ranked lower.
 *
 * Chance nodes (damage rolls, secondary effects, speed ties) collapse to
 * expected values for now. Possible refinements:
 * damage buckets, MCTS.
 */

import { calcAllMoves, calcDamage, type DamageOutcome } from '../damage';
import {
  getActive,
  type BattlePokemon,
  type BattleState,
  type PredictedSet,
} from '../state';
import { topCandidates } from '../predictor/predictor';
import type { PredictorContext } from '../predictor/types';
import { toFieldSpec, toSpec } from '../stateBridge';
import { describeAction, generateLegalActions } from './actions';
import { evaluate } from './evaluate';
import { simulateTurn, type SimContext } from './simulate';
import { effectiveSpeed, type SpeedContext } from './speed';
import {
  assumeDamageAverage,
  assumeNoCrit,
  assumeNoOpponentSwitch,
  assumeNoSecondary,
  assumeOpponentBestDamage,
  assumeOpponentSet,
  assumeSpeedTie,
  assumeTera,
  buildThreatAnalysis,
  formatPVStep,
  formatSpeedComparison,
  rankingConfidence,
  whyItLost,
  type ExchangeView,
  type SetView,
  type SpeedView,
} from './explain';
import type {
  Action,
  AlternativeAction,
  Assumption,
  PVStep,
  Recommendation,
  SearchOptions,
  ThreatAnalysis,
} from './types';
import { DEFAULT_SEARCH_OPTIONS } from './types';

const GEN = 9;

// ---------------------------------------------------------------------------
// Internal per-action evaluation result
// ---------------------------------------------------------------------------

interface ActionEvaluation {
  action: Action;
  ev: number;
  /** Damage outcome against the current opponent active, for move actions. */
  preview: DamageOutcome | null;
  /** Most-likely opponent set used to build the headline narrative. */
  headlineSet: SetView | null;
  /** Opponent's predicted best move under the headline set. */
  opponentReply: { move: string; outcome: DamageOutcome } | null;
  /** Speed view at the moment of the player's decision. */
  speedView: SpeedView | null;
  /** Whether the player would move first under the headline set. */
  playerFirst: boolean;
  /** Whether our action would KO the opponent's active. */
  playerKO: boolean;
  /** Whether the opponent's reply would KO our active. */
  opponentKO: boolean;
  /** Free-form bullets the engine generates. */
  reasoning: string[];
  risks: string[];
  /** Structured caveats (assumption disclosure). */
  assumptions: Assumption[];
  /** Projected future under the search's best play. */
  principalVariation: PVStep[];
  /** ThreatAnalysis (outgoing / incoming / netExchange). */
  threatAnalysis: ThreatAnalysis | null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function recommend(
  state: BattleState,
  ctx: PredictorContext,
  options: Partial<SearchOptions> = {},
): Recommendation[] {
  const opts: SearchOptions = { ...DEFAULT_SEARCH_OPTIONS, ...options };
  if (state.isOver) return [];

  const simCtx: SimContext = {
    moves: ctx.moves,
    speciesLookup: (name) => ctx.pokemonByName[name.toLowerCase()],
  };

  const playerActions = generateLegalActions(state, 'player', { includeSwitches: opts.includeSwitches });
  if (!playerActions.length) return [];

  const sets = pickOpponentSets(state, opts.topKSets);
  const evaluations: ActionEvaluation[] = playerActions.map((a) =>
    scoreAction(state, a, sets, opts.depth, simCtx, ctx),
  );

  evaluations.sort((a, b) => b.ev - a.ev);
  const top = evaluations.slice(0, 3);
  const runnerUpEV = top.length > 1 ? top[1].ev : null;

  return top.map((e, i) => {
    const next = top[i + 1];
    const margin = next ? e.ev - next.ev : 0;
    const confidence = i === 0 ? rankingConfidence(e.ev, runnerUpEV) : 0;
    const alternatives: AlternativeAction[] = i === 0 ? buildAlternatives(top[0], evaluations.slice(1, 4)) : [];
    return {
      rank: i + 1,
      action: e.action,
      summary: describeAction(e.action),
      expectedValue: e.ev,
      margin,
      damagePreview: e.preview,
      reasoning: e.reasoning,
      risks: e.risks,
      confidence,
      threatAnalysis: e.threatAnalysis,
      principalVariation: e.principalVariation,
      assumptions: e.assumptions,
      alternatives,
    };
  });
}

// ---------------------------------------------------------------------------
// Per-action scoring + explanation
// ---------------------------------------------------------------------------

function scoreAction(
  state: BattleState,
  action: Action,
  sets: SetView[],
  depth: 1 | 2,
  simCtx: SimContext,
  ctx: PredictorContext,
): ActionEvaluation {
  // Step 1 - compute the EV by marginalizing over opponent sets. We capture
  // the headline (most-likely) set's outcomes separately for the narrative.
  let ev = 0;
  let preview: DamageOutcome | null = null;
  if (action.kind === 'move') preview = computeOutgoing(state, action.move);

  const headline: SetView | null = sets.length ? sets[0] : null;
  let opponentReply: { move: string; outcome: DamageOutcome } | null = null;
  let speedView: SpeedView | null = null;
  let playerFirst = true;
  let playerKO = false;
  let opponentKO = false;
  let principalVariation: PVStep[] = [];

  for (const view of sets) {
    const oppAction = bestOpponentResponse(state, simCtx, view.set);
    const branchValue = expandBranch(state, action, oppAction, view.set, depth, simCtx, ctx);
    ev += view.weight * branchValue;

    // Capture narrative details from the headline-set branch only.
    if (view === headline) {
      const projected = view.set ? withSet(state, view.set) : state;
      speedView = computeSpeedView(state, simCtx, view.set);
      playerFirst = determinePlayerFirst(state, action, oppAction, simCtx);
      if (action.kind === 'move' && preview) {
        playerKO = !preview.error && !preview.isZero && preview.ko.chance >= 0.5;
      }
      if (oppAction.kind === 'move') {
        const us = getActive(state, 'player');
        const oppActive = getActive(projected, 'opponent');
        if (us && oppActive) {
          const back = safeDamage(toSpec(oppActive), toSpec(us), oppAction.move, toFieldSpec(projected, 'opponent'));
          if (back && !back.error && !back.isZero) {
            opponentReply = { move: oppAction.move, outcome: back };
            opponentKO = back.ko.chance >= 0.5;
          }
        }
      }
      principalVariation = buildPV(state, action, oppAction, depth, simCtx, view.set, preview, opponentReply);
    }
  }

  // Step 2 - assemble free-form reasoning, risks, and structured assumptions.
  const reasoning: string[] = [];
  const risks: string[] = [];
  const assumptions: Assumption[] = [];

  if (speedView) reasoning.push(formatSpeedComparison(speedView));
  if (action.kind === 'move' && preview && !preview.isZero && !preview.error) {
    const them = getActive(state, 'opponent');
    if (them) {
      reasoning.push(`${action.move} → ${them.identity.species}: ${pct(preview)} (${koLine(preview)})`);
    }
  }
  if (action.kind === 'switch') {
    const slot = state.sides.player.team[action.toSlot];
    if (slot) {
      const hpPct = Math.round((slot.battle.currentHP / slot.battle.maxHP) * 100);
      reasoning.push(`Brings ${slot.identity.species} in (${hpPct}% HP).`);
    }
  }
  if (opponentReply) {
    const them = getActive(state, 'opponent');
    const us = getActive(state, 'player');
    if (them && us) {
      risks.push(
        `Predicted reply: ${them.identity.species} ${opponentReply.move} → ${us.identity.species}: ${pct(opponentReply.outcome)} (${koLine(opponentReply.outcome)}).`,
      );
    }
  }
  if (sets.length > 1) {
    const probs = sets
      .filter((s) => s.set)
      .map((s) => `${Math.round(s.weight * 100)}% ${s.set!.label}`)
      .join(', ');
    if (probs) reasoning.push(`Marginalized over: ${probs}.`);
  }

  // Structured assumptions (always populated so the UI can render the
  // "what we're assuming" checklist consistently).
  assumptions.push(...assumeOpponentSet(sets));
  assumptions.push(assumeOpponentBestDamage());
  assumptions.push(assumeDamageAverage());
  assumptions.push(assumeNoCrit());
  assumptions.push(assumeNoSecondary());
  if (speedView && speedView.usSpe === speedView.themSpe) assumptions.push(assumeSpeedTie());
  if (action.kind === 'move' && action.tera) assumptions.push(assumeTera());
  if (opponentReply) assumptions.push(assumeNoOpponentSwitch());

  // Step 3 - threat analysis.
  let threatAnalysis: ThreatAnalysis | null = null;
  if (action.kind === 'move') {
    const them = getActive(state, 'opponent');
    const us = getActive(state, 'player');
    if (them && us) {
      const exchange: ExchangeView = {
        outgoing: preview && !preview.error && !preview.isZero
          ? { moveName: action.move, defenderName: them.identity.species, outcome: preview }
          : null,
        incoming: opponentReply
          ? {
              attackerName: them.identity.species,
              moveName: opponentReply.move,
              defenderName: us.identity.species,
              outcome: opponentReply.outcome,
            }
          : null,
        playerFirst,
        playerKO,
        opponentKO,
      };
      threatAnalysis = buildThreatAnalysis(exchange);
    }
  }

  return {
    action,
    ev,
    preview,
    headlineSet: headline,
    opponentReply,
    speedView,
    playerFirst,
    playerKO,
    opponentKO,
    reasoning,
    risks,
    assumptions,
    principalVariation,
    threatAnalysis,
  };
}

// ---------------------------------------------------------------------------
// Tree expansion
// ---------------------------------------------------------------------------

function expandBranch(
  state: BattleState,
  playerAction: Action,
  oppAction: Action,
  set: PredictedSet | null,
  depth: 1 | 2,
  simCtx: SimContext,
  ctx: PredictorContext,
): number {
  const next = simulateTurn(state, playerAction, oppAction, simCtx, set ?? undefined);
  if (next.isOver) return evaluate(next).total;
  if (depth === 1) return evaluate(next).total;

  const ourActions = generateLegalActions(next, 'player', { includeSwitches: true });
  if (!ourActions.length) return evaluate(next).total;
  let best = -Infinity;
  for (const a of ourActions) {
    const oppB = bestOpponentResponse(next, simCtx, set);
    const child = simulateTurn(next, a, oppB, simCtx, set ?? undefined);
    const v = evaluate(child).total;
    if (v > best) best = v;
  }
  void ctx;
  return best;
}

// ---------------------------------------------------------------------------
// Principal variation builder
// ---------------------------------------------------------------------------

function buildPV(
  state: BattleState,
  playerAction: Action,
  oppAction: Action,
  depth: 1 | 2,
  simCtx: SimContext,
  set: PredictedSet | null,
  outgoing: DamageOutcome | null,
  opponentReply: { move: string; outcome: DamageOutcome } | null,
): PVStep[] {
  const steps: PVStep[] = [];
  const us = getActive(state, 'player');
  const them = getActive(state, 'opponent');
  if (!us || !them) return steps;

  // Step 1 - our action.
  steps.push(
    formatPVStep({
      turn: state.turn,
      side: 'player',
      actor: us,
      action: playerAction,
      outcome: playerAction.kind === 'move' ? outgoing : null,
      defenderName: them.identity.species,
    }),
  );
  // Step 2 - opponent's reply (only if it would resolve).
  const wouldOppFaint = outgoing && outgoing.ko.chance >= 1;
  if (!wouldOppFaint && opponentReply) {
    steps.push(
      formatPVStep({
        turn: state.turn,
        side: 'opponent',
        actor: them,
        action: { kind: 'move', move: opponentReply.move },
        outcome: opponentReply.outcome,
        defenderName: us.identity.species,
      }),
    );
  }
  // Step 3 (depth 2) - our next-turn best response.
  if (depth === 2) {
    const afterTurn = simulateTurn(state, playerAction, oppAction, simCtx, set ?? undefined);
    if (!afterTurn.isOver) {
      const us2 = getActive(afterTurn, 'player');
      const them2 = getActive(afterTurn, 'opponent');
      if (us2 && them2) {
        const actions2 = generateLegalActions(afterTurn, 'player', { includeSwitches: true });
        let bestAction: Action | null = null;
        let bestValue = -Infinity;
        for (const a of actions2) {
          const oppB = bestOpponentResponse(afterTurn, simCtx, set);
          const child = simulateTurn(afterTurn, a, oppB, simCtx, set ?? undefined);
          const v = evaluate(child).total;
          if (v > bestValue) {
            bestValue = v;
            bestAction = a;
          }
        }
        if (bestAction) {
          const out2 = bestAction.kind === 'move'
            ? safeDamage(toSpec(us2), toSpec(them2), bestAction.move, toFieldSpec(afterTurn, 'player'))
            : null;
          steps.push(
            formatPVStep({
              turn: afterTurn.turn,
              side: 'player',
              actor: us2,
              action: bestAction,
              outcome: out2,
              defenderName: them2.identity.species,
            }),
          );
        }
      }
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Alternatives builder
// ---------------------------------------------------------------------------

function buildAlternatives(top: ActionEvaluation, runners: ActionEvaluation[]): AlternativeAction[] {
  return runners.slice(0, 3).map((r) => ({
    action: r.action,
    summary: describeAction(r.action),
    expectedValue: r.ev,
    loss: Math.max(0, top.ev - r.ev),
    reasonItLost: whyItLost({
      topAction: top.action,
      altAction: r.action,
      topDmg: top.preview,
      altDmg: r.preview,
      evLoss: top.ev - r.ev,
    }),
  }));
}

// ---------------------------------------------------------------------------
// Helpers - opponent set selection, best response, projection
// ---------------------------------------------------------------------------

function pickOpponentSets(state: BattleState, topK: number): SetView[] {
  const opp = getActive(state, 'opponent');
  if (!opp) return [{ set: null, weight: 1 }];
  if (!opp.uncertainty || opp.uncertainty.candidates.length === 0) {
    return [{ set: null, weight: 1 }];
  }
  const top = topCandidates(opp.uncertainty, topK);
  if (!top.length) return [{ set: null, weight: 1 }];
  const sum = top.reduce((a, c) => a + c.weight, 0) || 1;
  return top.map((c) => ({ set: c, weight: c.weight / sum }));
}

function bestOpponentResponse(state: BattleState, simCtx: SimContext, set: PredictedSet | null): Action {
  const opp = getActive(state, 'opponent');
  const us = getActive(state, 'player');
  if (!opp || !us) return { kind: 'move', move: 'Tackle' };
  const projected = set ? withSet(state, set) : state;
  const oppProjected = getActive(projected, 'opponent');
  if (!oppProjected) return { kind: 'move', move: 'Tackle' };
  const usSpec = toSpec(us);
  const field = toFieldSpec(projected, 'opponent');
  const outcomes = calcAllMoves(GEN, toSpec(oppProjected), usSpec, field);
  outcomes.sort((a, b) => {
    if (a.ko.chance !== b.ko.chance) return b.ko.chance - a.ko.chance;
    return b.avgDamage - a.avgDamage;
  });
  const best = outcomes.find((o) => !o.isZero && !o.error);
  if (best) return { kind: 'move', move: best.moveName };
  const moveName = oppProjected.set.moves[0]?.name;
  if (moveName) return { kind: 'move', move: moveName };
  void simCtx;
  return { kind: 'move', move: 'Tackle' };
}

function computeSpeedView(state: BattleState, simCtx: SimContext, set: PredictedSet | null): SpeedView | null {
  const us = getActive(state, 'player');
  const projected = set ? withSet(state, set) : state;
  const opp = getActive(projected, 'opponent');
  if (!us || !opp) return null;
  const usSpe = effectiveSpeed(state, 'player', us, simCtx.speciesLookup(us.identity.species));
  const themSpe = effectiveSpeed(projected, 'opponent', opp, simCtx.speciesLookup(opp.identity.species));
  return {
    usName: us.identity.species,
    themName: opp.identity.species,
    usSpe,
    themSpe,
    trickRoom: state.field.isTrickRoom,
  };
}

function determinePlayerFirst(
  state: BattleState,
  playerAction: Action,
  oppAction: Action,
  simCtx: SimContext,
): boolean {
  // Switches always resolve first. Beyond that we re-use the simulator's
  // priority/speed logic indirectly - for narrative we only need a boolean.
  if (playerAction.kind === 'switch' && oppAction.kind !== 'switch') return true;
  if (oppAction.kind === 'switch' && playerAction.kind !== 'switch') return false;
  const view = computeSpeedView(state, simCtx, null);
  if (!view) return true;
  if (view.usSpe === view.themSpe) return true; // tie → player-first by convention
  return state.field.isTrickRoom ? view.usSpe < view.themSpe : view.usSpe > view.themSpe;
}

function withSet(state: BattleState, set: PredictedSet): BattleState {
  const slot = state.activeSlot.opponent;
  const opp = state.sides.opponent.team[slot];
  if (!opp) return state;
  return {
    ...state,
    sides: {
      ...state.sides,
      opponent: {
        ...state.sides.opponent,
        team: state.sides.opponent.team.map((p, i) =>
          i === slot && p
            ? {
                ...p,
                set: {
                  nature: set.nature,
                  ability: { value: set.ability, source: 'INFERRED' },
                  item: { value: set.item, source: 'INFERRED' },
                  teraType: { value: set.teraType, source: 'INFERRED' },
                  ivs: set.ivs,
                  evs: set.evs,
                  moves: p.set.moves.length
                    ? p.set.moves
                    : set.moves.map((name) => ({ name, ppCurrent: 16, ppMax: 16, source: 'INFERRED' as const })),
                },
              }
            : p,
        ),
      },
    },
  };
}

function computeOutgoing(state: BattleState, moveName: string): DamageOutcome | null {
  const us = getActive(state, 'player');
  const them = getActive(state, 'opponent');
  if (!us || !them) return null;
  return safeDamage(toSpec(us), toSpec(them), moveName, toFieldSpec(state, 'player'));
}

function safeDamage(
  attacker: ReturnType<typeof toSpec>,
  defender: ReturnType<typeof toSpec>,
  moveName: string,
  field: ReturnType<typeof toFieldSpec>,
): DamageOutcome | null {
  try {
    return calcDamage(GEN, attacker, defender, moveName, field);
  } catch {
    return null;
  }
}

function pct(out: DamageOutcome, precision = 0): string {
  return `${out.pctMin.toFixed(precision)}–${out.pctMax.toFixed(precision)}%`;
}

function koLine(out: DamageOutcome): string {
  if (out.ko.text) return out.ko.text;
  if (out.ko.chance >= 1) return `${out.ko.n}HKO`;
  return 'no KO';
}

// Re-exports kept for tests.
export const __internal__ = { bestOpponentResponse, pickOpponentSets, buildAlternatives, buildPV };
export type { SpeedContext };
// Silence unused-import lint for BattlePokemon (kept for future PV typing).
export type { BattlePokemon };
