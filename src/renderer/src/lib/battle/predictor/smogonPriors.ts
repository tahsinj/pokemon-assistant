/**
 * Usage-statistics-backed set priors, plugged into the set generator via
 * `PredictorContext.customSetPool`.
 *
 * Converts the format's usage bundle into CandidateSet pools:
 *   - one candidate per curated Smogon dex set (slashed moves resolved to the
 *     first option the species can learn in *Cobblemon* - learnsets diverge),
 *     weighted by how much the ladder actually uses the set's item;
 *   - one "usage default" candidate straight from the stats marginals (top
 *     ability/item/spread + top learnable moves), covering ladder-vs-dex drift.
 *
 * Species absent from the bundle keep the archetype generator fallback.
 */

import type { BaseStats, Pokemon } from '../../types';
import type { SmogonBundle, SmogonSet, SmogonSpeciesIntel } from '../../smogon';
import type { CandidateSet } from './types';

const NEUTRAL_IVS: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const STAT_ORDER: (keyof BaseStats)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
/** Relative prior mass given to the usage-default candidate when curated sets exist. */
const USAGE_DEFAULT_PRIOR = 0.35;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function statArrayToBaseStats(arr: number[] | undefined, fill: number): BaseStats {
  const out = { hp: fill, atk: fill, def: fill, spa: fill, spd: fill, spe: fill };
  if (arr) STAT_ORDER.forEach((k, i) => (out[k] = arr[i] ?? fill));
  return out;
}

function learnableIds(species: Pokemon): Set<string> {
  return new Set(species.moves.map((m) => m.move));
}

/** Highest chaos usage % among the given item names (0 when unknown). */
function itemUsage(intel: SmogonSpeciesIntel, items: string[]): number {
  let best = 0;
  for (const it of items) {
    const hit = intel.items.find((x) => norm(x.name) === norm(it));
    if (hit && hit.pct > best) best = hit.pct;
  }
  return best;
}

function curatedToCandidate(
  species: Pokemon,
  intel: SmogonSpeciesIntel,
  setName: string,
  set: SmogonSet,
): CandidateSet | null {
  const canLearn = learnableIds(species);
  const moves: string[] = [];
  for (const slot of set.moves) {
    const pick = slot.find((opt) => canLearn.has(norm(opt))) ?? null;
    if (pick && !moves.includes(pick)) moves.push(pick);
  }
  if (moves.length === 0) return null;

  // Slashed items: prefer the option the ladder actually uses most.
  let item: string | null = set.item[0] ?? null;
  if (set.item.length > 1) {
    item = [...set.item].sort((a, b) => itemUsage(intel, [b]) - itemUsage(intel, [a]))[0];
  }

  return {
    id: `${species.id}:smogon:${norm(setName)}`,
    label: `Smogon: ${setName}`,
    nature: set.nature ?? intel.spreads[0]?.nature ?? 'Serious',
    ability: set.ability ?? intel.abilities[0]?.name ?? species.abilities[0] ?? 'No Ability',
    item,
    teraType: set.teraType ?? null,
    ivs: statArrayToBaseStats(set.ivs, 31),
    evs: statArrayToBaseStats(set.evs, 0),
    moves: moves.slice(0, 4),
    // Item-usage agreement as a popularity proxy; floor keeps niche sets alive.
    prior: Math.max(0.05, itemUsage(intel, item ? [item] : []) / 100),
  };
}

function usageDefaultCandidate(species: Pokemon, intel: SmogonSpeciesIntel): CandidateSet | null {
  const canLearn = learnableIds(species);
  const moves = intel.moves
    .filter((m) => canLearn.has(norm(m.name)))
    .slice(0, 4)
    .map((m) => m.name);
  if (moves.length === 0) return null;
  const spread = intel.spreads[0];
  return {
    id: `${species.id}:smogon:usage-default`,
    label: 'Smogon usage default',
    nature: spread?.nature ?? 'Serious',
    ability: intel.abilities[0]?.name ?? species.abilities[0] ?? 'No Ability',
    item: intel.items[0]?.name === 'No item' ? null : (intel.items[0]?.name ?? null),
    teraType: intel.teraTypes[0]?.name ?? null,
    ivs: { ...NEUTRAL_IVS },
    evs: statArrayToBaseStats(spread?.evs, 0),
    moves,
    prior: USAGE_DEFAULT_PRIOR,
  };
}

/**
 * Build the custom set pool for every bundle species present in `pokemonById`.
 * Priors are normalized per species (the generator re-normalizes anyway).
 */
export function buildSmogonSetPool(
  bundle: SmogonBundle,
  pokemonById: Record<string, Pokemon>,
): Record<string, CandidateSet[]> {
  const pool: Record<string, CandidateSet[]> = {};
  for (const [id, intel] of Object.entries(bundle.species)) {
    const species = pokemonById[id];
    if (!species) continue;

    const sets: CandidateSet[] = [];
    for (const [name, set] of Object.entries(intel.sets ?? {})) {
      const c = curatedToCandidate(species, intel, name, set);
      if (c) sets.push(c);
    }
    // Curated priors share (1 - USAGE_DEFAULT_PRIOR) proportionally.
    const curatedTotal = sets.reduce((a, s) => a + s.prior, 0);
    if (curatedTotal > 0) {
      for (const s of sets) s.prior = (s.prior / curatedTotal) * (1 - USAGE_DEFAULT_PRIOR);
    }

    const dflt = usageDefaultCandidate(species, intel);
    if (dflt) sets.push(dflt);
    if (sets.length === 0) continue;

    const total = sets.reduce((a, s) => a + s.prior, 0);
    pool[id] = sets.map((s) => ({ ...s, prior: s.prior / total }));
  }
  return pool;
}
