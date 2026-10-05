/** Types the explanation helpers (`explain.ts`) build and the UI renders. */

export type Action =
  | { kind: 'move'; move: string; tera?: boolean }
  | { kind: 'switch'; toSlot: number };

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
  /** "Earthquake -> Tatsugiri: 102-121% (guaranteed OHKO)" */
  outgoing: string | null;
  /** "Predicted reply: Tatsugiri Draco Meteor -> 80-95% (2HKO)" */
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
  /** Pre-formatted line for the UI ("Garchomp uses Earthquake -> 102-121% on Tatsugiri"). */
  text: string;
}
