/**
 * Build concrete, calc-ready sets from the Smogon usage bundle: the "Showdown
 * Usage" autofill (most common ability / item / spread / moves) and curated
 * set options resolved against the format's learnsets. Shared by the Team Builder
 * set editor and the Calcdex.
 */

import type { BaseStats, Pokemon } from './types';
import type { SmogonSpeciesIntel } from './smogon';
import { resolveSetMoves } from './smogonSets';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Usage-stat placeholder rows that aren't real picks. */
const PLACEHOLDER = new Set(['other', 'nothing', 'noability', 'noitem']);

export interface SetFill {
  /** Display label, e.g. "Showdown Usage" or a curated set name. */
  label: string;
  ability: string | null;
  item: string | null;
  nature: string | null;
  evs: BaseStats;
  ivs: BaseStats;
  moves: string[];
  teraType?: string;
}

const FILL_31: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const FILL_0: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** Smogon arrays are [hp, atk, def, spa, spd, spe]. */
function statsFromArray(arr: number[] | undefined, fallback: BaseStats): BaseStats {
  if (!arr || arr.length < 6) return { ...fallback };
  return { hp: arr[0], atk: arr[1], def: arr[2], spa: arr[3], spd: arr[4], spe: arr[5] };
}

function learnableSet(species: Pokemon): Set<string> {
  return new Set(species.moves.map((m) => m.move));
}

/**
 * Top usage moves the species can actually learn in the format, most-used
 * first. When the learnset is unknown (backfilled species) the filter is
 * skipped rather than dropping everything.
 */
export function topUsageMoves(species: Pokemon, intel: SmogonSpeciesIntel, count = 4): string[] {
  const canLearn = learnableSet(species);
  const candidates = intel.moves.filter((m) => !PLACEHOLDER.has(norm(m.name)));
  const filtered = canLearn.size > 0 ? candidates.filter((m) => canLearn.has(norm(m.name))) : candidates;
  const pool = filtered.length > 0 ? filtered : candidates;
  return pool.slice(0, count).map((m) => m.name);
}

/** The single most common meta build: ability, item, spread, top-4 moves. */
export function usageFill(species: Pokemon, intel: SmogonSpeciesIntel): SetFill {
  const ability = intel.abilities.find((a) => !PLACEHOLDER.has(norm(a.name)))?.name ?? null;
  const item = intel.items.find((i) => !PLACEHOLDER.has(norm(i.name)))?.name ?? null;
  const spread = intel.spreads[0];
  const tera = intel.teraTypes.find((t) => !PLACEHOLDER.has(norm(t.name)))?.name;
  return {
    label: 'Showdown Usage',
    ability,
    item,
    nature: spread?.nature ?? null,
    evs: statsFromArray(spread?.evs, FILL_0),
    ivs: { ...FILL_31 },
    moves: topUsageMoves(species, intel, 4),
    teraType: tera,
  };
}

/** Curated Smogon sets resolved to learnable moves, in bundle order. */
export function curatedFills(species: Pokemon, intel: SmogonSpeciesIntel): SetFill[] {
  const out: SetFill[] = [];
  for (const [name, set] of Object.entries(intel.sets ?? {})) {
    const moves = resolveSetMoves(species, set);
    if (moves.length === 0) continue;
    out.push({
      label: name,
      ability: set.ability,
      item: set.item[0] ?? null,
      nature: set.nature,
      evs: statsFromArray(set.evs, FILL_0),
      ivs: statsFromArray(set.ivs, FILL_31),
      moves,
      teraType: set.teraType,
    });
  }
  return out;
}

/** All fills for a species: usage build first, then curated sets. */
export function allSetFills(species: Pokemon, intel: SmogonSpeciesIntel | null): SetFill[] {
  if (!intel) return [];
  return [usageFill(species, intel), ...curatedFills(species, intel)];
}

/**
 * Order move names for pickers: ladder-usage moves first (most used first),
 * then the rest alphabetically. `names` should be display names.
 */
export function sortMovesByUsage(names: string[], intel: SmogonSpeciesIntel | null): string[] {
  if (!intel) return [...names].sort((a, b) => a.localeCompare(b));
  const pct = new Map<string, number>();
  for (const m of intel.moves) pct.set(norm(m.name), m.pct);
  return [...names].sort((a, b) => {
    const pa = pct.get(norm(a)) ?? -1;
    const pb = pct.get(norm(b)) ?? -1;
    if (pa !== pb) return pb - pa;
    return a.localeCompare(b);
  });
}
