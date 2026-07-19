import { calculate, Generations, Pokemon as CalcPokemon, Move as CalcMove, Field as CalcField, Result, ABILITIES } from '@smogon/calc';
import type { BattlePokemonSpec, FieldSpec, Generation } from './types';
import { getMergedMove, getMergedSpecies } from './dex';

// Our data stores abilities id-form ("levitate", "sturdy"); @smogon/calc matches
// abilities by exact display name, so an unmapped id is silently ignored (no
// Levitate immunity, no Sturdy, no Huge Power, …). Normalize id -> display name.
const ABILITY_BY_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const latest = ABILITIES[ABILITIES.length - 1] ?? [];
  for (const name of latest) map[name.toLowerCase().replace(/[^a-z0-9]/g, '')] = name;
  return map;
})();
function properAbility(ability?: string): string | undefined {
  if (!ability) return undefined;
  return ABILITY_BY_ID[ability.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? ability;
}

export interface DamageOutcome {
  moveName: string;
  category: 'Physical' | 'Special' | 'Status';
  basePower: number;
  /** All damage rolls. Empty for 0-damage / status moves. */
  rolls: number[];
  min: number;
  max: number;
  avgDamage: number;
  /** As % of defender's current max HP. */
  pctMin: number;
  pctMax: number;
  /** Per-call KO probability. n=1 OHKO is what we care about most. */
  ko: { chance: number; n: number; text: string };
  desc: string;
  /** True when the move has no damage roll (status, miss, immune). */
  isZero: boolean;
  /** If the calc returned an error (unknown move/species), surface here. */
  error?: string;
}

const GEN_CACHE = new Map<Generation, ReturnType<typeof Generations.get>>();
function gen(generation: Generation) {
  let g = GEN_CACHE.get(generation);
  if (!g) {
    g = Generations.get(generation);
    GEN_CACHE.set(generation, g);
  }
  return g;
}

function buildPokemon(generation: Generation, spec: BattlePokemonSpec): CalcPokemon {
  const g = gen(generation);
  // @smogon/calc treats teraType being set as "this mon is terastallized" - there
  // is no separate boolean. Only forward it when the caller explicitly opted in.
  const teraType = spec.isTerastallized && spec.teraType ? spec.teraType : undefined;
  // Apply Cobblemon overrides (types / base stats / weight) when the species
  // has a registered divergence. We forward these via the Pokemon constructor's
  // Partial<State.Pokemon> options so the calc treats them as authoritative
  // instead of using its built-in Showdown table.
  const merged = getMergedSpecies(spec.speciesName, generation);
  const cobblemonOverrides = merged?.hasOverride
    ? {
        types: merged.types as never,
        weightkg: merged.weightkg,
      }
    : {};
  const baseOpts = {
    level: spec.level,
    nature: spec.nature,
    ability: properAbility(spec.ability),
    item: spec.item,
    teraType: teraType as never,
    isDynamaxed: spec.isDynamaxed ?? false,
    ivs: spec.ivs,
    evs: spec.evs,
    boosts: spec.boosts,
    status: spec.status,
    ...cobblemonOverrides,
  } as const;
  // KO chance scales with current HP - when the caller supplied a percentage,
  // probe maxHP first then re-instantiate with the absolute curHP so the calc's
  // kochance() reflects "from this HP" rather than "from full".
  if (spec.currentHPPercent != null && spec.currentHPPercent < 100) {
    const probe = new CalcPokemon(g, spec.speciesName, baseOpts);
    const maxHP = probe.maxHP();
    const pct = Math.max(0, Math.min(100, spec.currentHPPercent));
    const curHP = Math.max(1, Math.round((maxHP * pct) / 100));
    return new CalcPokemon(g, spec.speciesName, { ...baseOpts, curHP });
  }
  return new CalcPokemon(g, spec.speciesName, baseOpts);
}

/**
 * Build the `overrides` payload for `new CalcMove(...)` when the move has a
 * Cobblemon-specific divergence. Returns undefined when no override exists.
 *
 * We only emit fields the calc cares about for damage: bp, type, category,
 * priority. Accuracy/PP overrides surface to the UI but don't affect the
 * calc's damage math directly.
 */
function moveOverridePayload(name: string, generation: Generation):
  | { basePower?: number; type?: string; category?: string; priority?: number }
  | undefined {
  const m = getMergedMove(name, generation);
  if (!m || !m.hasOverride || !m.divergence) return undefined;
  // `@smogon/calc`'s Move constructor merges `options.overrides` onto its
  // internal `MoveData`. The internal field names are: `basePower`, `type`,
  // `category`, `priority` (see calc's `move.js`). Use those exact names -
  // `bp` won't be picked up.
  const out: { basePower?: number; type?: string; category?: string; priority?: number } = {};
  if (m.divergence.basePower) out.basePower = m.basePower;
  if (m.divergence.type) out.type = m.type;
  if (m.divergence.category) out.category = m.category;
  if (m.divergence.priority) out.priority = m.priority;
  return Object.keys(out).length ? out : undefined;
}

function buildField(spec: FieldSpec): CalcField {
  return new CalcField({
    weather: spec.weather ? (spec.weather as never) : undefined,
    terrain: spec.terrain ? (spec.terrain as never) : undefined,
    isGravity: spec.isGravity,
    attackerSide: {
      spikes: spec.attackerSide.spikes,
      steelsurge: spec.attackerSide.steelsurge,
      isSR: spec.attackerSide.stealthRock,
      isReflect: spec.attackerSide.isReflect,
      isLightScreen: spec.attackerSide.isLightScreen,
      isAuroraVeil: spec.attackerSide.isAuroraVeil,
      isTailwind: spec.attackerSide.isTailwind,
    } as never,
    defenderSide: {
      spikes: spec.defenderSide.spikes,
      steelsurge: spec.defenderSide.steelsurge,
      isSR: spec.defenderSide.stealthRock,
      isReflect: spec.defenderSide.isReflect,
      isLightScreen: spec.defenderSide.isLightScreen,
      isAuroraVeil: spec.defenderSide.isAuroraVeil,
      isTailwind: spec.defenderSide.isTailwind,
    } as never,
  });
}

function flattenDamage(d: Result['damage']): number[] {
  if (typeof d === 'number') return d > 0 ? [d] : [];
  if (!Array.isArray(d)) return [];
  // Multi-hit: array of arrays - sum the per-hit rolls index by index.
  if (Array.isArray(d[0])) {
    const arrays = d as number[][];
    if (!arrays.length) return [];
    const len = arrays[0].length;
    const summed = new Array<number>(len).fill(0);
    for (const arr of arrays) {
      for (let i = 0; i < arr.length; i++) summed[i] += arr[i];
    }
    return summed;
  }
  return d as number[];
}

/**
 * Run a single damage calc for attacker vs defender using `moveName`.
 * Returns a uniform `DamageOutcome` - never throws on unknown moves; surfaces
 * the error string instead so the UI can render a row per move.
 */
export function calcDamage(
  generation: Generation,
  attacker: BattlePokemonSpec,
  defender: BattlePokemonSpec,
  moveName: string,
  field: FieldSpec,
): DamageOutcome {
  try {
    const g = gen(generation);
    const atk = buildPokemon(generation, attacker);
    const def = buildPokemon(generation, defender);
    const overrides = moveOverridePayload(moveName, generation);
    const move = new CalcMove(g, moveName, {
      ability: properAbility(attacker.ability),
      item: attacker.item,
      species: attacker.speciesName,
      ...(overrides ? { overrides: overrides as never } : {}),
    });
    const f = buildField(field);
    const result = calculate(g, atk, def, move, f);
    const rolls = flattenDamage(result.damage);
    const isZero = rolls.length === 0 || (rolls.length > 0 && rolls[rolls.length - 1] === 0);

    if (isZero) {
      return {
        moveName,
        category: move.category as DamageOutcome['category'],
        basePower: move.bp ?? 0,
        rolls: [],
        min: 0,
        max: 0,
        avgDamage: 0,
        pctMin: 0,
        pctMax: 0,
        ko: { chance: 0, n: 0, text: '' },
        desc: safeDesc(result),
        isZero: true,
      };
    }

    const min = rolls[0];
    const max = rolls[rolls.length - 1];
    const avg = rolls.reduce((a, b) => a + b, 0) / rolls.length;
    const defMax = def.maxHP();
    const ko = result.kochance();
    return {
      moveName,
      category: move.category as DamageOutcome['category'],
      basePower: move.bp ?? 0,
      rolls,
      min,
      max,
      avgDamage: avg,
      pctMin: defMax > 0 ? (min / defMax) * 100 : 0,
      pctMax: defMax > 0 ? (max / defMax) * 100 : 0,
      ko: { chance: ko.chance ?? 0, n: ko.n ?? 0, text: ko.text || '' },
      desc: safeDesc(result),
      isZero: false,
    };
  } catch (e) {
    return {
      moveName,
      category: 'Status',
      basePower: 0,
      rolls: [],
      min: 0,
      max: 0,
      avgDamage: 0,
      pctMin: 0,
      pctMax: 0,
      ko: { chance: 0, n: 0, text: '' },
      desc: '',
      isZero: true,
      error: e instanceof Error ? e.message : 'calc failed',
    };
  }
}

function safeDesc(result: Result): string {
  try {
    return result.desc();
  } catch {
    return '';
  }
}

/**
 * Run calc for every move on the attacker and return outcomes in the same
 * order. Convenience for the UI.
 */
export function calcAllMoves(
  generation: Generation,
  attacker: BattlePokemonSpec,
  defender: BattlePokemonSpec,
  field: FieldSpec,
): DamageOutcome[] {
  return attacker.moves
    .filter((m) => m.name && m.name.trim().length > 0)
    .map((m) => calcDamage(generation, attacker, defender, m.name, field));
}
