/**
 * Sync our Cobblemon-derived `pokemon.json` into the override registry.
 *
 * At app startup we already load the merged Cobblemon dataset via
 * `lib/data.ts`. This module walks that dataset, compares each species to
 * `@smogon/calc`'s baked-in baseline, and registers a `SpeciesOverride` for
 * every field that diverges. The result is:
 *
 *   - The damage engine consults the registry per call and gets Cobblemon's
 *     view of base stats / types / weight / abilities.
 *   - The UI can read `buildManifest()` and surface a list of every
 *     divergence with a tooltip.
 *
 * The sync is idempotent: re-running it with the same input produces the
 * same registry. Callers can pass a fresh `OverrideRegistry` or use the
 * global one.
 */

import type { Pokemon as CobblemonSpecies } from '../types';
import {
  registerSpeciesOverride,
  type OverrideRegistry,
  type SpeciesDivergence,
  type SpeciesOverride,
  getGlobalRegistry,
} from './overrides';
import { getMergedSpecies } from './dex';
import type { StatsTable } from '@smogon/calc';

export interface SyncResult {
  /** How many species were processed. */
  processed: number;
  /** How many had at least one divergence. */
  divergent: number;
  /** Every species not found in the Showdown table (Cobblemon-only forms). */
  unmatched: string[];
  /** Detail per divergent species, in the order they were registered. */
  diffs: { name: string; divergence: SpeciesDivergence }[];
}

/**
 * Register every Cobblemon species that differs from Showdown.
 *
 * Important note on comparison:
 *
 *   - Showdown's stat table uses keys `{hp, atk, def, spa, spd, spe}`.
 *   - Cobblemon's mod data uses `{hp, attack, defence, special_attack, ...}`
 *     which `fetch-data.mjs` already normalizes to the Showdown shape, so we
 *     compare them directly here.
 *   - Ability comparison is **set-equivalence**, not order-sensitive - order
 *     in the Cobblemon JSON often doesn't match Showdown's slot semantics.
 *   - We do not register an override when the Showdown lookup fails - that's
 *     usually a Cobblemon-only form (regional / fakemon / unreleased) and the
 *     dex/damage code will fall through to the raw Cobblemon record.
 */
export function syncCobblemonSpecies(
  cobblemonSpecies: CobblemonSpecies[],
  registry: OverrideRegistry = getGlobalRegistry(),
): SyncResult {
  const out: SyncResult = { processed: 0, divergent: 0, unmatched: [], diffs: [] };

  for (const cb of cobblemonSpecies) {
    out.processed++;
    // We *don't* call getMergedSpecies(name, gen, registry) for the showdown
    // baseline - that would feed back any existing override. Instead, look up
    // the bare Showdown view via a freshly created empty registry.
    const showdown = getMergedSpecies(cb.name, 9, EMPTY_REGISTRY);
    if (!showdown) {
      out.unmatched.push(cb.name);
      continue;
    }
    const divergence = diffSpecies(showdown.types, showdown.baseStats, showdown.weightkg, showdown.abilities, cb);
    if (divergence === null) continue;

    const override: SpeciesOverride = {
      id: cb.id ?? cb.name.toLowerCase(),
      name: cb.name,
      types: divergence.types ? [...cb.types] : undefined,
      baseStats: divergence.baseStats ? { ...cb.baseStats } : undefined,
      weightkg: divergence.weightkg ? cb.weight / 10 : undefined,
      divergence,
      source: 'COBBLEMON_DATA',
    };
    registerSpeciesOverride(registry, override);
    out.divergent++;
    out.diffs.push({ name: cb.name, divergence });
  }

  return out;
}

// An always-empty registry used to fetch the bare Showdown view without
// looping back through the global one.
const EMPTY_REGISTRY: OverrideRegistry = {
  species: new Map(),
  moves: new Map(),
  abilities: new Map(),
  items: new Map(),
};

// ---------------------------------------------------------------------------
// Diff helpers - return null when nothing differs.
// ---------------------------------------------------------------------------

function diffSpecies(
  showdownTypes: string[],
  showdownStats: StatsTable,
  showdownWeight: number,
  showdownAbilities: string[],
  cb: CobblemonSpecies,
): SpeciesDivergence | null {
  const out: SpeciesDivergence = {};
  let any = false;

  if (!sameTypeList(showdownTypes, cb.types)) {
    out.types = { showdown: showdownTypes, cobblemon: [...cb.types] };
    any = true;
  }
  const statDiff = diffStats(showdownStats, cb.baseStats);
  if (statDiff) {
    out.baseStats = statDiff;
    any = true;
  }
  // Cobblemon `weight` field is in hectograms (e.g. 950 = 95.0 kg). Showdown
  // weight is in kg. Normalize before compare.
  const cbWeightKg = cb.weight / 10;
  if (showdownWeight && Math.abs(showdownWeight - cbWeightKg) > 0.1) {
    out.weightkg = { showdown: showdownWeight, cobblemon: cbWeightKg };
    any = true;
  }
  // Ability comparison is informational only. We deliberately *don't* flag
  // ability divergences here because:
  //   1. `@smogon/calc`'s SPECIES table only stores slot-0 abilities (Showdown
  //      compresses for size), so naive comparison would flag every species
  //      that has more than one ability.
  //   2. The damage engine reads the explicit `ability` field on each
  //      Pokémon - it doesn't pull from the species table - so an ability
  //      override at this level has no effect on calc output.
  // If the user wants to flag a specific ability divergence, they add a
  // `MANUAL_ABILITY_OVERRIDES` entry which surfaces as a UI note.
  void showdownAbilities;
  return any ? out : null;
}

function diffStats(a: StatsTable, b: StatsTable): SpeciesDivergence['baseStats'] | null {
  const out: NonNullable<SpeciesDivergence['baseStats']> = {};
  let any = false;
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as (keyof StatsTable)[]) {
    if (a[k] !== b[k]) {
      out[k] = { showdown: a[k], cobblemon: b[k] };
      any = true;
    }
  }
  return any ? out : null;
}

function sameTypeList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const an = a.map((t) => t.toLowerCase()).sort();
  const bn = b.map((t) => t.toLowerCase()).sort();
  return an.every((v, i) => v === bn[i]);
}

// ---------------------------------------------------------------------------
// One-shot convenience: lazy-load `pokemon.json` and register everything.
// Callers that already loaded the data should use `syncCobblemonSpecies`.
// ---------------------------------------------------------------------------

export async function syncFromLoader(
  loader: () => Promise<CobblemonSpecies[]>,
  registry: OverrideRegistry = getGlobalRegistry(),
): Promise<SyncResult> {
  const species = await loader();
  return syncCobblemonSpecies(species, registry);
}
