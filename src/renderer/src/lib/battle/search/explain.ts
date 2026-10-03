/**
 * Explanation layer.
 *
 * Templated formatters that turn search-engine facts into the strings the UI
 * renders inside each `Recommendation`. Kept as pure functions so they can be
 * unit-tested without spinning up a battle.
 *
 * The UI has three rendering needs:
 *
 *   1. **Damage facts** - range, KO chance, breakdown.
 *   2. **Speed / order facts** - who outspeeds whom, under what conditions.
 *   3. **Set / move predictions** - which opponent set is most likely and
 *      what move they'll likely click.
 *
 * Each helper returns a single sentence so the caller can drop it into a
 * `reasoning[]` or `risks[]` array verbatim.
 */

import type { DamageOutcome } from '../damage';
import type { Action, Assumption, PVStep, ThreatAnalysis } from './types';
import type { BattlePokemon, PredictedSet } from '../state';

// ---------------------------------------------------------------------------
// Damage / KO
// ---------------------------------------------------------------------------

/** "85-101%" or "85.4-101.2%" depending on precision request. */
export function formatDamageRange(out: DamageOutcome, precision = 1): string {
  if (out.isZero || out.error) return '0%';
  const lo = out.pctMin.toFixed(precision);
  const hi = out.pctMax.toFixed(precision);
  return `${lo}–${hi}%`;
}

/** "guaranteed OHKO" / "76.0% chance to OHKO" / "2HKO" / "no KO". */
export function formatKOLine(out: DamageOutcome): string {
  if (out.isZero || out.error) return 'no damage';
  if (out.ko.text) return out.ko.text;
  if (out.ko.chance >= 1) return `${out.ko.n}HKO`;
  if (out.ko.chance > 0) return `${(out.ko.chance * 100).toFixed(1)}% chance to ${out.ko.n}HKO`;
  return 'no KO';
}

/** "Earthquake -> Tatsugiri: 102-121% (guaranteed OHKO)" */
export function formatOutgoing(moveName: string, defenderName: string, out: DamageOutcome): string {
  return `${moveName} → ${defenderName}: ${formatDamageRange(out)} (${formatKOLine(out)})`;
}

/** "Tatsugiri Draco Meteor -> Garchomp: 60-72% (2HKO)" */
export function formatIncoming(
  attackerName: string,
  moveName: string,
  defenderName: string,
  out: DamageOutcome,
): string {
  return `${attackerName} ${moveName} → ${defenderName}: ${formatDamageRange(out)} (${formatKOLine(out)})`;
}

// ---------------------------------------------------------------------------
// Speed / order
// ---------------------------------------------------------------------------

export interface SpeedView {
  usName: string;
  themName: string;
  usSpe: number;
  themSpe: number;
  trickRoom: boolean;
}

export function formatSpeedComparison(v: SpeedView): string {
  if (v.usSpe === v.themSpe) {
    return `Speed tie at ${v.usSpe} (50/50 order - assumed player-first).`;
  }
  const usFaster = v.trickRoom ? v.usSpe < v.themSpe : v.usSpe > v.themSpe;
  const verb = usFaster ? 'Outspeeds' : 'Outsped by';
  const suffix = v.trickRoom ? ' under Trick Room' : '';
  return `${verb} ${v.themName} (${v.usSpe} vs ${v.themSpe})${suffix}.`;
}

// ---------------------------------------------------------------------------
// Predictor (set + move)
// ---------------------------------------------------------------------------

export interface SetView {
  set: PredictedSet | null;
  weight: number;
}

/** "Tera-Steel Choice Specs Modest (70%)" */
export function formatSetLabel(view: SetView): string {
  if (!view.set) return 'Showdown-default set (100%)';
  const pct = Math.round(view.weight * 100);
  return `${view.set.label} (${pct}%)`;
}

/** Compact "70% Choice Specs, 20% Choice Scarf, 10% Life Orb" */
export function formatSetDistribution(views: SetView[]): string {
  if (!views.length) return 'no candidate sets';
  return views
    .filter((v) => v.set)
    .map((v) => `${Math.round(v.weight * 100)}% ${v.set!.label}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Threat exchange
// ---------------------------------------------------------------------------

export interface ExchangeView {
  /** Our action's outgoing damage outcome, when action.kind === 'move'. */
  outgoing: { moveName: string; defenderName: string; outcome: DamageOutcome } | null;
  /** The opponent's predicted reply (a move outcome). */
  incoming: { attackerName: string; moveName: string; defenderName: string; outcome: DamageOutcome } | null;
  /** True when the player moves first (priority + speed considered). */
  playerFirst: boolean;
  /** True when our action would KO their active. */
  playerKO: boolean;
  /** True when their predicted reply would KO our active. */
  opponentKO: boolean;
}

export function buildThreatAnalysis(view: ExchangeView): ThreatAnalysis {
  const outgoing = view.outgoing ? formatOutgoing(view.outgoing.moveName, view.outgoing.defenderName, view.outgoing.outcome) : null;
  const incoming = view.incoming
    ? formatIncoming(view.incoming.attackerName, view.incoming.moveName, view.incoming.defenderName, view.incoming.outcome)
    : null;
  const netExchange = describeNetExchange(view);
  return { outgoing, incoming, netExchange };
}

function describeNetExchange(view: ExchangeView): string {
  // Order matters in the description: "we" before "they" only when we go first.
  if (view.playerFirst) {
    if (view.playerKO && view.opponentKO) return 'We KO before their reply lands. Clean trade.';
    if (view.playerKO && !view.opponentKO) return 'We KO; their reply does not resolve. Free turn.';
    if (!view.playerKO && view.opponentKO) return 'We outspeed but cannot KO; they KO us back. Net negative.';
    return 'Both sides damaged; neither falls this turn.';
  }
  // Opponent first.
  if (view.opponentKO && view.playerKO) return 'They KO us first; our action does not resolve.';
  if (view.opponentKO && !view.playerKO) return 'They KO us; trade lost.';
  if (!view.opponentKO && view.playerKO) return 'We survive and KO them on the next strike. Net positive.';
  return 'They strike first; both sides damaged, neither falls.';
}

// ---------------------------------------------------------------------------
// Assumptions
// ---------------------------------------------------------------------------

/** "Assumes opponent set is Choice Specs Modest (70% probability)." */
export function assumeOpponentSet(views: SetView[]): Assumption[] {
  if (!views.length) return [];
  const filtered = views.filter((v) => v.set);
  if (!filtered.length) return [];
  const top = filtered[0];
  if (!top.set) return [];
  return [
    {
      kind: 'opponent-set',
      probability: top.weight,
      text: `Top opponent hypothesis: ${top.set.label} (${Math.round(top.weight * 100)}%); marginalized over ${filtered.length} candidate set${
        filtered.length > 1 ? 's' : ''
      }.`,
    },
  ];
}

/** "Assumes opponent picks their max-damage move (no setup considered)." */
export function assumeOpponentBestDamage(): Assumption {
  return {
    kind: 'opponent-move',
    text: 'Assumes opponent picks their highest-damage move (status moves and setup are not modeled).',
  };
}

/** "Damage shown is the mean of 16 rolls; high/low rolls within +/-15%." */
export function assumeDamageAverage(): Assumption {
  return {
    kind: 'damage-roll',
    text: 'Damage figures are mean of 16 rolls; min/max within ±15% are not branched on in the search.',
  };
}

export function assumeNoCrit(): Assumption {
  return {
    kind: 'crit',
    text: 'Critical hits are not modeled in the EV (base ~1/24 chance, ×1.5 damage on success).',
  };
}

export function assumeNoSecondary(): Assumption {
  return {
    kind: 'secondary',
    text: 'Secondary effect chances (burn/flinch/drop) are not modeled in the EV.',
  };
}

export function assumeSpeedTie(): Assumption {
  return {
    kind: 'speed-tie',
    probability: 0.5,
    text: 'Speed tie resolved deterministically (player-first). Actual outcome is 50/50.',
  };
}

export function assumeTera(): Assumption {
  return {
    kind: 'tera-timing',
    text: 'Recommendation consumes the once-per-battle Tera flag this turn.',
  };
}

export function assumeNoOpponentSwitch(): Assumption {
  return {
    kind: 'switch',
    text: 'Opponent switches are not modeled in the projection (Cobblemon trainer AI rarely switches).',
  };
}

// ---------------------------------------------------------------------------
// Principal variation
// ---------------------------------------------------------------------------

export interface PVRecordInput {
  turn: number;
  side: 'player' | 'opponent';
  actor: BattlePokemon | null;
  action: Action;
  outcome?: DamageOutcome | null;
  defenderName?: string;
}

/**
 * Convert one search step into a `PVStep`. The `text` is the surface form the
 * UI renders; the structured `action` lets the UI render an icon / button.
 */
export function formatPVStep(input: PVRecordInput): PVStep {
  const actor = input.actor?.identity.species ?? '?';
  let text: string;
  if (input.action.kind === 'switch') {
    text = `${input.side === 'player' ? 'We' : 'They'} switch (slot ${input.action.toSlot + 1}).`;
  } else if (input.outcome && input.defenderName) {
    text = `${actor} uses ${input.action.move} → ${formatDamageRange(input.outcome)} on ${input.defenderName} (${formatKOLine(input.outcome)}).`;
  } else {
    text = `${actor} uses ${input.action.move}.`;
  }
  return { turn: input.turn, side: input.side, action: input.action, actor, text };
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

/**
 * Confidence in ranking #1 over the next best. We use a soft logistic on the
 * EV gap so a 5-EV margin reads as ~88% confidence and a 0.5-EV margin reads
 * as ~62%. The choice of slope (1.0) is hand-tuned to feel right; tune as
 * eval weights shift.
 */
export function rankingConfidence(top: number, runnerUp: number | null): number {
  if (runnerUp == null) return 1;
  const gap = top - runnerUp;
  const slope = 0.6;
  return 1 / (1 + Math.exp(-slope * gap));
}

// ---------------------------------------------------------------------------
// Alternatives - "why not X?"
// ---------------------------------------------------------------------------

/** Compact reason an alternative ranked below the top pick. */
export function whyItLost(opts: {
  topAction: Action;
  altAction: Action;
  topDmg?: DamageOutcome | null;
  altDmg?: DamageOutcome | null;
  evLoss: number;
}): string {
  const { topDmg, altDmg, evLoss } = opts;
  if (opts.altAction.kind === 'switch') {
    return `Switching cedes the turn; the search prefers staying in (Δ EV ${evLoss.toFixed(2)}).`;
  }
  if (altDmg && topDmg && !altDmg.error && !topDmg.error) {
    const altKO = altDmg.ko.chance >= 1;
    const topKO = topDmg.ko.chance >= 1;
    if (topKO && !altKO) {
      return `Not a guaranteed KO (${formatDamageRange(altDmg)}); top pick is a guaranteed ${topDmg.ko.n}HKO.`;
    }
    if (altDmg.avgDamage < topDmg.avgDamage * 0.6) {
      return `Significantly less damage (${formatDamageRange(altDmg)} vs top pick ${formatDamageRange(topDmg)}).`;
    }
  }
  return `Lower projected EV (Δ ${evLoss.toFixed(2)}).`;
}

// Re-export the View types so callers can hand-construct them in tests.
export type { Assumption, PVStep, ThreatAnalysis };
