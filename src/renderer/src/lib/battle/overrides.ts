/**
 * Cobblemon override registry.
 *
 * The engine's source of truth is Showdown / `@smogon/calc`. Cobblemon is a
 * fan project that diverges from mainline in three predictable places:
 *
 *   1. Some species have different base stats / types / ability slots.
 *   2. Some moves have different base power / type / category.
 *   3. A handful of items / abilities behave differently or aren't implemented.
 *
 * Rather than fork the data tables, we keep Showdown as the baseline and lay
 * a thin override sheet on top. Anywhere we look up a species / move / item /
 * ability, we consult this registry first.
 *
 * Two override sources:
 *
 *   - `MANUAL_OVERRIDES` - hand-authored deltas for known Cobblemon-specific
 *     mechanics that can't be derived from data alone (e.g. an ability that
 *     does something different in Cobblemon than in Showdown).
 *   - `runtime registrations` - added by `cobblemonSync` when it walks the
 *     emitted `pokemon.json` and detects divergence from Showdown.
 *
 * Both are merged in registration order; runtime entries can shadow manual
 * ones, which is intentional (Cobblemon mod is authoritative for stats/types).
 */

import type { StatsTable } from '@smogon/calc';

// ---------------------------------------------------------------------------
// Override shapes
// ---------------------------------------------------------------------------

export interface SpeciesOverride {
  /** Lowercase Cobblemon id (e.g. "garchomp"). */
  id: string;
  /** Display name (preserved for messages). */
  name: string;
  /** Cobblemon's typing; we override Showdown's if these differ. */
  types?: string[];
  /** Cobblemon's base stats; treated as authoritative. */
  baseStats?: Partial<StatsTable>;
  /** Cobblemon weight (kg). Affects Low Kick / Heavy Slam BP. */
  weightkg?: number;
  /** Cobblemon-known ability slots (regular + hidden). */
  abilities?: string[];
  hiddenAbilities?: string[];
  /** Which Showdown fields differ (audit trail for the UI badge). */
  divergence?: SpeciesDivergence;
  source: OverrideSource;
}

export interface SpeciesDivergence {
  types?: { showdown: string[]; cobblemon: string[] };
  baseStats?: Partial<{ [K in keyof StatsTable]: { showdown: number; cobblemon: number } }>;
  weightkg?: { showdown: number; cobblemon: number };
  abilities?: { showdown: string[]; cobblemon: string[] };
}

export interface MoveOverride {
  /** Lowercase id (e.g. "earthquake"). */
  id: string;
  name: string;
  type?: string;
  category?: 'Physical' | 'Special' | 'Status';
  basePower?: number;
  accuracy?: number | true;
  pp?: number;
  priority?: number;
  /** Targeting / flags / secondary tweaks if Cobblemon diverges. */
  target?: string;
  source: OverrideSource;
  /** Note shown in the UI tooltip. */
  note?: string;
}

export interface AbilityOverride {
  id: string;
  name: string;
  /**
   * Free-form note. We can't dynamically patch ability mechanics in
   * `@smogon/calc` from here - but we surface the divergence to the user so
   * they know not to trust the calc on that one ability.
   */
  note: string;
  source: OverrideSource;
}

export interface ItemOverride {
  id: string;
  name: string;
  note: string;
  source: OverrideSource;
}

export type OverrideSource = 'MANUAL' | 'COBBLEMON_DATA' | 'USER';

// ---------------------------------------------------------------------------
// Manual overrides - hand-authored, used when data alone can't capture the
// divergence (e.g. ability mechanics, items that behave differently). Add
// entries here as you discover them while playing Cobblemon.
// ---------------------------------------------------------------------------

export const MANUAL_SPECIES_OVERRIDES: SpeciesOverride[] = [
  // Example shape - keep empty until a real divergence is found:
  // {
  //   id: 'garchomp',
  //   name: 'Garchomp',
  //   types: ['dragon', 'ground'],
  //   baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  //   source: 'MANUAL',
  // },
];

export const MANUAL_MOVE_OVERRIDES: MoveOverride[] = [
  // Example: a Cobblemon-specific BP tweak. Add as discovered.
];

export const MANUAL_ABILITY_OVERRIDES: AbilityOverride[] = [
  // Example: { id: 'sandveil', name: 'Sand Veil', note: 'Cobblemon does not implement the evasion boost.', source: 'MANUAL' },
];

export const MANUAL_ITEM_OVERRIDES: ItemOverride[] = [];

// ---------------------------------------------------------------------------
// Registry - runtime-merged set of overrides keyed by id.
// ---------------------------------------------------------------------------

export interface OverrideRegistry {
  species: Map<string, SpeciesOverride>;
  moves: Map<string, MoveOverride>;
  abilities: Map<string, AbilityOverride>;
  items: Map<string, ItemOverride>;
}

export function createRegistry(): OverrideRegistry {
  const reg: OverrideRegistry = {
    species: new Map(),
    moves: new Map(),
    abilities: new Map(),
    items: new Map(),
  };
  for (const s of MANUAL_SPECIES_OVERRIDES) reg.species.set(normalizeId(s.id), s);
  for (const m of MANUAL_MOVE_OVERRIDES) reg.moves.set(normalizeId(m.id), m);
  for (const a of MANUAL_ABILITY_OVERRIDES) reg.abilities.set(normalizeId(a.id), a);
  for (const i of MANUAL_ITEM_OVERRIDES) reg.items.set(normalizeId(i.id), i);
  return reg;
}

export function registerSpeciesOverride(reg: OverrideRegistry, override: SpeciesOverride): void {
  reg.species.set(normalizeId(override.id), override);
}

export function registerMoveOverride(reg: OverrideRegistry, override: MoveOverride): void {
  reg.moves.set(normalizeId(override.id), override);
}

export function registerAbilityOverride(reg: OverrideRegistry, override: AbilityOverride): void {
  reg.abilities.set(normalizeId(override.id), override);
}

export function registerItemOverride(reg: OverrideRegistry, override: ItemOverride): void {
  reg.items.set(normalizeId(override.id), override);
}

export function getSpeciesOverride(reg: OverrideRegistry, name: string): SpeciesOverride | undefined {
  return reg.species.get(normalizeId(name));
}

export function getMoveOverride(reg: OverrideRegistry, name: string): MoveOverride | undefined {
  return reg.moves.get(normalizeId(name));
}

export function getAbilityOverride(reg: OverrideRegistry, name: string): AbilityOverride | undefined {
  return reg.abilities.get(normalizeId(name));
}

export function getItemOverride(reg: OverrideRegistry, name: string): ItemOverride | undefined {
  return reg.items.get(normalizeId(name));
}

// ---------------------------------------------------------------------------
// Process-wide singleton - convenience for legacy callers that don't have a
// `ctx` parameter. Battle/predictor/search threads pass their own registry,
// but the damage engine consults this singleton.
// ---------------------------------------------------------------------------

let GLOBAL: OverrideRegistry | null = null;

export function getGlobalRegistry(): OverrideRegistry {
  if (!GLOBAL) GLOBAL = createRegistry();
  return GLOBAL;
}

export function resetGlobalRegistry(): void {
  GLOBAL = createRegistry();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Compact summary for the UI badge tooltip. Returns the highlights of the
 * divergence map.
 */
export function summarizeSpeciesDivergence(d: SpeciesDivergence | undefined): string[] {
  if (!d) return [];
  const out: string[] = [];
  const fmt = (arr: string[]) => (arr.length === 0 ? '-' : arr.join('/'));
  if (d.types) {
    out.push(`Types: ${fmt(d.types.showdown)} → ${fmt(d.types.cobblemon)}`);
  }
  if (d.baseStats) {
    for (const [stat, pair] of Object.entries(d.baseStats)) {
      if (!pair) continue;
      out.push(`${stat.toUpperCase()}: ${pair.showdown} → ${pair.cobblemon}`);
    }
  }
  if (d.weightkg) {
    out.push(`Weight: ${d.weightkg.showdown}kg → ${d.weightkg.cobblemon}kg`);
  }
  if (d.abilities) {
    out.push(`Abilities: ${fmt(d.abilities.showdown)} → ${fmt(d.abilities.cobblemon)}`);
  }
  return out;
}
