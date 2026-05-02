/**
 * Search-engine public types.
 *
 * Each `Recommendation` is the engine's full payload for one candidate action.
 * The shape is designed so the UI can render every part of the
 * explanation layer with no further computation:
 *
 *   - `summary` and `expectedValue` for the headline.
 *   - `threatAnalysis` for the central "we hit them / they hit us / net" line.
 *   - `damagePreview` for the raw damage roll figures.
 *   - `principalVariation` for the turn-by-turn projection the search assumed.
 *   - `reasoning` / `risks` for free-form bullet points.
 *   - `assumptions` for the structured caveats the user can override
 *     ("I know this Tatsugiri is Scarf, lock it.").
 *   - `alternatives` for the "why not X?" disclosure on the top pick only.
 *   - `confidence` for "how sure are we about ranking #1 vs #2".
 */

import type { DamageOutcome } from '../damage';

export type Action =
  | { kind: 'move'; move: string; tera?: boolean }
  | { kind: 'switch'; toSlot: number };

export interface SearchOptions {
  /** Plies of lookahead. depth=1 is one turn pair, depth=2 is two. */
  depth: 1 | 2;
  /** Number of top opponent set hypotheses to marginalize over. */
  topKSets: number;
  /** Time budget hint (ms) - search exits early if exceeded. */
  timeBudgetMs?: number;
  /** When true, include switches in the action set. */
  includeSwitches: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  depth: 2,
  topKSets: 3,
  timeBudgetMs: 2000,
  includeSwitches: true,
};

// ---------------------------------------------------------------------------
// Explanation layer
// ---------------------------------------------------------------------------

/**
 * A structured caveat. The engine attaches one of these for every
 * not-fully-certain choice in the recommendation, so the UI can render them
 * as a checklist of "things we're assuming" - and the user can override.
 */
export interface Assumption {
  kind:
    | 'opponent-set'      // we marginalized over a candidate set distribution
    | 'opponent-move'     // we assumed the opponent picks their best damage move
    | 'damage-roll'       // we collapsed damage variance to the average
    | 'crit'              // crits not modeled in expected value
    | 'secondary'         // secondary effects not modeled
    | 'speed-tie'         // 50/50 order resolved deterministically
    | 'tera-timing'       // we assumed the player would Terastallize this turn
    | 'switch';           // we assumed no opponent switch
  /** Probability of the assumption holding, when meaningful (0..1). */
  probability?: number;
  /** Short, surface-able note for the UI. */
  text: string;
}

/**
 * A summary of the projected exchange. All three lines are pre-formatted so
 * the UI can render them as a single block. Each is nullable when the
 * exchange is degenerate (e.g. switch action has no outgoing-damage line).
 */
export interface ThreatAnalysis {
  /** "Earthquake -> Tatsugiri: 102–121% (guaranteed OHKO)" */
  outgoing: string | null;
  /** "Predicted reply: Tatsugiri Draco Meteor -> 80–95% (2HKO)" */
  incoming: string | null;
  /** "We KO first; opp switches in, we take 70% next turn." */
  netExchange: string;
}

/**
 * A principal-variation step - a single action in the projected future the
 * search assumed when scoring this recommendation. Generated walking forward
 * from the current state by `depth` plies.
 */
export interface PVStep {
  /** Turn index when the action occurs. */
  turn: number;
  /** Whose action this is in the projected future. */
  side: 'player' | 'opponent';
  /** The action itself. */
  action: Action;
  /** Pokémon performing the action, by display name (e.g. "Garchomp"). */
  actor: string;
  /** Pre-formatted line for the UI ("Garchomp uses Earthquake -> 102–121% on Tatsugiri"). */
  text: string;
}

/**
 * An alternative the search considered and ranked below #1. Attached to the
 * top recommendation only.
 */
export interface AlternativeAction {
  action: Action;
  summary: string;
  expectedValue: number;
  /** EV gap vs the top recommendation (always positive). */
  loss: number;
  /** Compact reason this option lost ("KO not guaranteed", "outsped and KO'd"). */
  reasonItLost: string;
}

export interface Recommendation {
  rank: number;
  action: Action;
  /** Human-readable summary, e.g. "Earthquake", "Switch to Dragapult". */
  summary: string;
  /** Search EV (signed; positive = good for the player). */
  expectedValue: number;
  /** EV margin over the next-ranked action. 0 on the lowest-ranked rec. */
  margin: number;
  /** When action.kind === 'move', the damage preview against the opponent active. */
  damagePreview?: DamageOutcome | null;
  /** Free-form bullets explaining favorable details. */
  reasoning: string[];
  /** Free-form bullets surfacing what could go wrong. */
  risks: string[];
  // -- Explanation fields -------------------------------------------------
  /** 0..1 confidence in this ranking vs the next-best option. */
  confidence: number;
  /** Structured exchange summary; null for a degenerate action (e.g. dead branch). */
  threatAnalysis: ThreatAnalysis | null;
  /** Projected turn-by-turn future under the search's best play. */
  principalVariation: PVStep[];
  /** Structured caveats the user can override. */
  assumptions: Assumption[];
  /** Alternatives ranked below #1. Populated only on rank 1; empty otherwise. */
  alternatives: AlternativeAction[];
}

/** Score breakdown returned by the eval function. */
export interface EvalBreakdown {
  total: number;
  hp: number;
  count: number;
  status: number;
  boost: number;
  hazard: number;
  screens: number;
  tempo: number;
}
