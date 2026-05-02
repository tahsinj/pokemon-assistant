/**
 * Cobblemon-aware dex accessor.
 *
 * Wraps `@smogon/calc`'s baked-in `SPECIES`/`MOVES`/`ABILITIES`/`ITEMS`
 * tables and overlays the project's `OverrideRegistry` on top. Anywhere the
 * engine needs the canonical "this is what the move/species really is in
 * Cobblemon" view, it calls this module.
 *
 * The output is shaped to be friendly to two callers:
 *
 *   1. **Damage engine** - needs the merged stats / types / weight so
 *      `@smogon/calc` evaluates the right Pokémon. We hand back the deltas
 *      that should be passed to `new Pokemon(...)` / `new Move(...)`.
 *   2. **UI** - needs to know "does this thing diverge from Showdown?" so it
 *      can render a Cobblemon badge with a tooltip explaining what changed.
 */

import { Generations, SPECIES, MOVES } from '@smogon/calc';
import type { StatsTable } from '@smogon/calc';
import {
  getGlobalRegistry,
  getMoveOverride,
  getSpeciesOverride,
  normalizeId,
  type MoveOverride,
  type OverrideRegistry,
  type SpeciesDivergence,
  type SpeciesOverride,
} from './overrides';
import type { Generation } from './types';

// ---------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------

export interface MergedSpecies {
  name: string;
  id: string;
  types: string[];
  baseStats: StatsTable;
  weightkg: number;
  abilities: string[];
  /** Set when Cobblemon's view of this species differs from Showdown's. */
  divergence: SpeciesDivergence | null;
  /** True when any override applies. */
  hasOverride: boolean;
}

export function getMergedSpecies(
  name: string,
  generation: Generation = 9,
  registry: OverrideRegistry = getGlobalRegistry(),
): MergedSpecies | null {
  const showdown = lookupShowdownSpecies(name, generation);
  if (!showdown) return null;
  const override = getSpeciesOverride(registry, name);
  if (!override) {
    return {
      name: showdown.name,
      id: normalizeId(showdown.name),
      types: [...showdown.types],
      baseStats: { ...showdown.baseStats },
      weightkg: showdown.weightkg,
      abilities: [...showdown.abilities],
      divergence: null,
      hasOverride: false,
    };
  }
  // Apply field-by-field merge: override wins.
  const merged: MergedSpecies = {
    name: override.name ?? showdown.name,
    id: normalizeId(override.id ?? showdown.name),
    types: override.types ?? [...showdown.types],
    baseStats: { ...showdown.baseStats, ...(override.baseStats ?? {}) } as StatsTable,
    weightkg: override.weightkg ?? showdown.weightkg,
    abilities: override.abilities ?? [...showdown.abilities],
    divergence: override.divergence ?? null,
    hasOverride: true,
  };
  return merged;
}

interface ShowdownSpecies {
  name: string;
  types: string[];
  baseStats: StatsTable;
  weightkg: number;
  abilities: string[];
}

function lookupShowdownSpecies(name: string, generation: Generation): ShowdownSpecies | null {
  // `@smogon/calc` exports the per-gen species table directly; this is much
  // faster than building a `Generations.get(gen).species` instance every call.
  const idx = Math.max(1, Math.min(generation, SPECIES.length - 1));
  // Walk back through the gens until we find the species (cross-gen species).
  for (let g = idx; g >= 1; g--) {
    const tbl = SPECIES[g];
    if (!tbl) continue;
    for (const key of Object.keys(tbl)) {
      if (normalizeId(key) === normalizeId(name)) {
        const data = tbl[key];
        const bs = data.bs;
        return {
          name: key,
          types: [...data.types],
          baseStats: {
            hp: bs.hp,
            atk: bs.at,
            def: bs.df,
            spa: bs.sa ?? bs.sl ?? bs.at,
            spd: bs.sd ?? bs.sl ?? bs.df,
            spe: bs.sp,
          },
          weightkg: data.weightkg,
          abilities: Object.values(data.abilities ?? {}),
        };
      }
    }
  }
  // Fallback through `Generations` API.
  try {
    const g = Generations.get(generation);
    const sp = g.species.get(normalizeId(name) as never);
    if (!sp) return null;
    return {
      name: sp.name,
      types: [...sp.types],
      baseStats: { ...sp.baseStats } as StatsTable,
      weightkg: sp.weightkg,
      abilities: sp.abilities ? Object.values(sp.abilities) : [],
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

export interface MergedMove {
  id: string;
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  target: string;
  /** True when an override modified one or more fields. */
  hasOverride: boolean;
  /** Fields that differ from Showdown. */
  divergence: MoveDivergence | null;
  /** Operator-facing note. */
  note?: string;
}

export interface MoveDivergence {
  basePower?: { showdown: number; cobblemon: number };
  type?: { showdown: string; cobblemon: string };
  category?: { showdown: string; cobblemon: string };
  priority?: { showdown: number; cobblemon: number };
  accuracy?: { showdown: number | true; cobblemon: number | true };
  pp?: { showdown: number; cobblemon: number };
}

export function getMergedMove(
  name: string,
  generation: Generation = 9,
  registry: OverrideRegistry = getGlobalRegistry(),
): MergedMove | null {
  const id = normalizeId(name);
  const showdown = lookupShowdownMove(id, generation);
  if (!showdown) return null;
  const override = getMoveOverride(registry, id);
  if (!override) {
    return {
      id,
      name: showdown.name,
      type: showdown.type,
      category: showdown.category,
      basePower: showdown.basePower,
      accuracy: showdown.accuracy,
      pp: showdown.pp,
      priority: showdown.priority,
      target: showdown.target,
      hasOverride: false,
      divergence: null,
    };
  }
  const divergence: MoveDivergence = {};
  if (override.basePower != null && override.basePower !== showdown.basePower) {
    divergence.basePower = { showdown: showdown.basePower, cobblemon: override.basePower };
  }
  if (override.type && override.type !== showdown.type) {
    divergence.type = { showdown: showdown.type, cobblemon: override.type };
  }
  if (override.category && override.category !== showdown.category) {
    divergence.category = { showdown: showdown.category, cobblemon: override.category };
  }
  if (override.priority != null && override.priority !== showdown.priority) {
    divergence.priority = { showdown: showdown.priority, cobblemon: override.priority };
  }
  if (override.accuracy != null && override.accuracy !== showdown.accuracy) {
    divergence.accuracy = { showdown: showdown.accuracy, cobblemon: override.accuracy };
  }
  if (override.pp != null && override.pp !== showdown.pp) {
    divergence.pp = { showdown: showdown.pp, cobblemon: override.pp };
  }
  return {
    id,
    name: override.name ?? showdown.name,
    type: override.type ?? showdown.type,
    category: override.category ?? showdown.category,
    basePower: override.basePower ?? showdown.basePower,
    accuracy: override.accuracy ?? showdown.accuracy,
    pp: override.pp ?? showdown.pp,
    priority: override.priority ?? showdown.priority,
    target: override.target ?? showdown.target,
    hasOverride: Object.keys(divergence).length > 0,
    divergence: Object.keys(divergence).length > 0 ? divergence : null,
    note: override.note,
  };
}

interface ShowdownMove {
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  target: string;
}

function lookupShowdownMove(id: string, generation: Generation): ShowdownMove | null {
  const idx = Math.max(1, Math.min(generation, MOVES.length - 1));
  for (let g = idx; g >= 1; g--) {
    const tbl = MOVES[g];
    if (!tbl) continue;
    for (const key of Object.keys(tbl)) {
      if (normalizeId(key) === id) {
        const m = tbl[key];
        return {
          name: key,
          type: String(m.type ?? 'normal').toLowerCase(),
          category: (m.category ?? 'Status') as ShowdownMove['category'],
          basePower: m.bp ?? 0,
          accuracy: true, // Showdown's compact move table omits accuracy; treat as true (always hits) unless override fills it.
          pp: 0, // Same - PP isn't in the calc's compact move table.
          priority: m.priority ?? 0,
          target: (m.target ?? 'normal') as string,
        };
      }
    }
  }
  // Fall back to generation API (slower but more complete).
  try {
    const g = Generations.get(generation);
    const m = g.moves.get(id as never);
    if (!m) return null;
    return {
      name: m.name,
      type: String(m.type).toLowerCase(),
      category: (m.category ?? 'Status') as ShowdownMove['category'],
      basePower: m.basePower ?? 0,
      accuracy: true,
      pp: 0,
      priority: m.priority ?? 0,
      target: String(m.target ?? 'normal'),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Aggregate audit - every override currently registered.
// ---------------------------------------------------------------------------

export interface OverrideManifest {
  species: SpeciesOverride[];
  moves: MoveOverride[];
  /** Total count for the UI / settings panel. */
  totals: { species: number; moves: number; abilities: number; items: number };
}

export function buildManifest(registry: OverrideRegistry = getGlobalRegistry()): OverrideManifest {
  return {
    species: Array.from(registry.species.values()),
    moves: Array.from(registry.moves.values()),
    totals: {
      species: registry.species.size,
      moves: registry.moves.size,
      abilities: registry.abilities.size,
      items: registry.items.size,
    },
  };
}
