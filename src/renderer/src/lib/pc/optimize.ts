/**
 * Compares a stored Pokémon against NatDex OU usage data (smogon.json) and
 * surfaces what looks off-meta, with a concrete fix. Pure + data-driven so it
 * can be unit-tested and reused by any "this mon in my PC" surface.
 *
 * Guiding principle (from the product spec): don't nag about choices that have
 * a legitimate competitive use case. Only flag a slot when (a) the mon is
 * missing something the metagame runs heavily, or (b) what the mon runs has
 * essentially no usage and a clearly more common option exists.
 */

import type { Pokemon, StatKey } from '../types';
import type { SmogonSpeciesIntel, SmogonSpread } from '../smogon';

const STAT_ORDER: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Tunable cut-offs. Exported so the UI can explain them and tests can assert. */
export const OPT_THRESHOLDS = {
  /** A move/ability at or above this share is "core"; missing it is a real gap. */
  coreMovePct: 50,
  /** Running a move below this share (or unlisted) reads as off-meta. */
  nicheMovePct: 5,
  /** Items at or above this share count as a viable, expected choice. */
  itemViablePct: 10,
  /** One ability at or above this share is the de-facto standard. */
  abilityDominantPct: 60,
  /** An ability with at least this much usage has its own use case - leave it. */
  abilityViablePct: 15,
  /** A nature contributing less than this across spreads reads as off-meta. */
  natureViablePct: 5,
  /** A single EV spread at/above this share is the clearly dominant build. */
  spreadDominantPct: 40,
} as const;

export type OptSeverity = 'high' | 'medium' | 'low';
export type OptCategory = 'move' | 'nature' | 'item' | 'ability' | 'ev';

/** Structured patch the editor can apply with one click. All fields optional. */
export interface OptFix {
  nature?: string;
  item?: string;
  ability?: string;
  /** A heavily-used move this mon should add. */
  addMove?: string;
  /** A low-usage move worth reconsidering (paired with addMove when possible). */
  replaceMove?: string;
  evs?: Record<StatKey, number>;
}

export interface OptSuggestion {
  category: OptCategory;
  severity: OptSeverity;
  /** Short label, e.g. "Missing core move". */
  title: string;
  /** One-sentence explanation referencing the usage numbers. */
  detail: string;
  fix?: OptFix;
}

export interface StoredMonForReview {
  moves: string[];
  nature: string;
  item: string | null;
  ability: string;
  evs: Record<StatKey, number>;
}

const SEVERITY_RANK: Record<OptSeverity, number> = { high: 0, medium: 1, low: 2 };

/** Competitive-readiness verdict for at-a-glance indicators. */
export type Readiness = 'ready' | 'minor' | 'heavy' | 'unknown';

/** Collapse a review into a single readiness level. */
export function reviewReadiness(suggestions: OptSuggestion[]): Exclude<Readiness, 'unknown'> {
  if (suggestions.some((s) => s.severity === 'high')) return 'heavy';
  if (suggestions.length > 0) return 'minor';
  return 'ready';
}

/**
 * One-shot readiness for a stored mon. 'unknown' when there's no usage data to
 * judge against (so callers can render nothing rather than a misleading "ready").
 */
export function assessReadiness(
  mon: StoredMonForReview,
  species: Pokemon,
  intel: SmogonSpeciesIntel | null,
): Readiness {
  if (!intel) return 'unknown';
  return reviewReadiness(reviewStoredMon(mon, species, intel));
}

function evArrayToObject(evs: number[]): Record<StatKey, number> {
  const out = {} as Record<StatKey, number>;
  STAT_ORDER.forEach((k, i) => (out[k] = evs[i] ?? 0));
  return out;
}

function evObjectToArray(evs: Record<StatKey, number>): number[] {
  return STAT_ORDER.map((k) => evs[k] ?? 0);
}

/** The set of stats a build actually invests in (>= 4 EVs), as a stable key. */
function investmentPattern(evs: number[]): string {
  return evs.map((v, i) => (v >= 4 ? STAT_ORDER[i] : '')).filter(Boolean).join(',');
}

export function formatEvs(evs: number[]): string {
  const parts = evs
    .map((v, i) => (v > 0 ? `${v} ${STAT_LABELS[STAT_ORDER[i]]}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(' / ') : 'no EVs';
}

/**
 * Review a stored mon against its species' usage intel. Returns an ordered list
 * (most severe first); empty when there's no intel or nothing looks off.
 */
export function reviewStoredMon(
  mon: StoredMonForReview,
  species: Pokemon,
  intel: SmogonSpeciesIntel | null,
): OptSuggestion[] {
  if (!intel) return [];
  const out: OptSuggestion[] = [];

  const canLearn = new Set(species.moves.map((m) => norm(m.move)));
  const ownMoves = mon.moves.map((m) => m.trim()).filter(Boolean);
  const ownMoveSet = new Set(ownMoves.map(norm));

  const movePct = new Map<string, number>();
  for (const m of intel.moves) movePct.set(norm(m.name), m.pct);

  // --- Missing core moves -------------------------------------------------
  // Heavily-used moves the species can learn but this mon doesn't run.
  const missingCore = intel.moves.filter(
    (m) => m.pct >= OPT_THRESHOLDS.coreMovePct && !ownMoveSet.has(norm(m.name)) && canLearn.has(norm(m.name)),
  );
  for (const m of missingCore) {
    out.push({
      category: 'move',
      severity: m.pct >= 70 ? 'high' : 'medium',
      title: 'Missing core move',
      detail: `${m.name} is on ${m.pct.toFixed(0)}% of competitive ${intel.name}, but this set doesn't run it.`,
      fix: { addMove: m.name },
    });
  }

  // --- Off-meta moves -----------------------------------------------------
  // A move this mon runs that the ladder almost never does. Suggest the most
  // common move it isn't already running as the swap-in.
  const topUnused = intel.moves.find(
    (m) => !ownMoveSet.has(norm(m.name)) && canLearn.has(norm(m.name)) && m.pct >= OPT_THRESHOLDS.coreMovePct,
  );
  for (const mv of ownMoves) {
    const pct = movePct.get(norm(mv));
    if (pct === undefined || pct < OPT_THRESHOLDS.nicheMovePct) {
      out.push({
        category: 'move',
        severity: 'low',
        title: 'Rarely-used move',
        detail:
          pct === undefined
            ? `${mv} barely registers in usage stats for ${intel.name}.`
            : `${mv} is on only ${pct.toFixed(1)}% of ${intel.name}.`,
        fix: topUnused ? { replaceMove: mv, addMove: topUnused.name } : { replaceMove: mv },
      });
    }
  }

  // --- Item ---------------------------------------------------------------
  const topItem = intel.items[0];
  if (topItem && topItem.pct >= OPT_THRESHOLDS.itemViablePct) {
    const itemPct = mon.item
      ? intel.items.find((it) => norm(it.name) === norm(mon.item!))?.pct ?? 0
      : null;
    if (!mon.item) {
      out.push({
        category: 'item',
        severity: 'medium',
        title: 'No held item',
        detail: `${topItem.pct.toFixed(0)}% of ${intel.name} hold ${topItem.name}; this set has no item.`,
        fix: { item: topItem.name },
      });
    } else if ((itemPct ?? 0) < OPT_THRESHOLDS.itemViablePct) {
      out.push({
        category: 'item',
        severity: 'low',
        title: 'Off-meta item',
        detail:
          (itemPct ?? 0) > 0
            ? `${mon.item} is on only ${itemPct!.toFixed(1)}% of ${intel.name}; ${topItem.name} (${topItem.pct.toFixed(0)}%) is standard.`
            : `${mon.item} barely registers; ${topItem.name} (${topItem.pct.toFixed(0)}%) is standard.`,
        fix: { item: topItem.name },
      });
    }
  }

  // --- Ability ------------------------------------------------------------
  const dominantAbility = intel.abilities.find((a) => a.pct >= OPT_THRESHOLDS.abilityDominantPct);
  const hasAbility = (name: string) =>
    species.abilities.some((a) => norm(a) === norm(name)) ||
    species.hiddenAbilities.some((a) => norm(a) === norm(name));
  if (dominantAbility && hasAbility(dominantAbility.name) && norm(dominantAbility.name) !== norm(mon.ability)) {
    const ownPct = intel.abilities.find((a) => norm(a.name) === norm(mon.ability))?.pct ?? 0;
    if (ownPct < OPT_THRESHOLDS.abilityViablePct) {
      out.push({
        category: 'ability',
        severity: 'medium',
        title: 'Sub-optimal ability',
        detail: `${dominantAbility.name} is the standard ability (${dominantAbility.pct.toFixed(0)}%); this set runs ${mon.ability || '-'}.`,
        fix: { ability: dominantAbility.name },
      });
    }
  }

  // --- EV spread + nature -------------------------------------------------
  const spreads = intel.spreads ?? [];
  if (spreads.length > 0) {
    const ownEvArray = evObjectToArray(mon.evs);
    const ownPattern = investmentPattern(ownEvArray);
    const ownTotal = ownEvArray.reduce((a, b) => a + b, 0);
    const topSpread = spreads[0];
    const patternMatch = spreads.some((s) => investmentPattern(s.evs) === ownPattern);
    const dominant =
      topSpread.pct >= OPT_THRESHOLDS.spreadDominantPct ||
      (spreads[1] ? topSpread.pct >= spreads[1].pct * 2 : true);

    if (ownTotal === 0) {
      out.push({
        category: 'ev',
        severity: 'high',
        title: 'No EVs invested',
        detail: `This mon has no EVs. The most-used spread is ${topSpread.nature} ${formatEvs(topSpread.evs)} (${topSpread.pct.toFixed(0)}%).`,
        fix: { evs: evArrayToObject(topSpread.evs), nature: topSpread.nature },
      });
    } else if (!patternMatch) {
      out.push({
        category: 'ev',
        severity: dominant ? 'high' : 'medium',
        title: 'Off-meta EV spread',
        detail: `This investment (${formatEvs(ownEvArray)}) doesn't match any common spread. Most-used: ${topSpread.nature} ${formatEvs(topSpread.evs)} (${topSpread.pct.toFixed(0)}%).`,
        fix: { evs: evArrayToObject(topSpread.evs), nature: topSpread.nature },
      });
    } else {
      // Spread shape is fine - only then is it worth checking the nature on its
      // own (a flagged spread already carries the correct nature in its fix).
      const naturePct = naturePctTotal(spreads, mon.nature);
      if (naturePct < OPT_THRESHOLDS.natureViablePct) {
        const best = mostCommonNature(spreads);
        if (best && norm(best) !== norm(mon.nature)) {
          out.push({
            category: 'nature',
            severity: 'medium',
            title: 'Off-meta nature',
            detail: `${mon.nature} is rare on competitive ${intel.name}; ${best} is the common nature for this spread.`,
            fix: { nature: best },
          });
        }
      }
    }
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function naturePctTotal(spreads: SmogonSpread[], nature: string): number {
  return spreads
    .filter((s) => norm(s.nature) === norm(nature))
    .reduce((sum, s) => sum + s.pct, 0);
}

function mostCommonNature(spreads: SmogonSpread[]): string | null {
  const totals = new Map<string, { name: string; pct: number }>();
  for (const s of spreads) {
    const key = norm(s.nature);
    const cur = totals.get(key);
    if (cur) cur.pct += s.pct;
    else totals.set(key, { name: s.nature, pct: s.pct });
  }
  let best: { name: string; pct: number } | null = null;
  for (const v of totals.values()) if (!best || v.pct > best.pct) best = v;
  return best?.name ?? null;
}
