/**
 * Pure leaderboard logic for the Smogon usage viewer: join the usage bundle to
 * the Cobblemon dex, filter by name/type, and sort. No React, no DOM - unit
 * tested in smogonLeaderboard.test.ts.
 */
import type { Pokemon } from './types';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';
import { bst } from './stats';

export type SmogonSortMode = 'usage' | 'alpha' | 'bst';

export interface LeaderboardEntry {
  intel: SmogonSpeciesIntel;
  pokemon: Pokemon;
}

export interface LeaderboardOptions {
  /** Case-insensitive substring match on species name. */
  search?: string;
  /** Lowercase type id; '' means all types. */
  type?: string;
  sort?: SmogonSortMode;
}

export function buildLeaderboard(
  bundle: SmogonBundle,
  pokemonById: Record<string, Pokemon>,
  opts: LeaderboardOptions = {},
): LeaderboardEntry[] {
  const { search = '', type = '', sort = 'usage' } = opts;
  const q = search.trim().toLowerCase();

  const entries: LeaderboardEntry[] = [];
  for (const [id, intel] of Object.entries(bundle.species)) {
    const pokemon = pokemonById[id];
    if (!pokemon) continue; // can't resolve sprite/types - skip
    if (type && !pokemon.types.some((t) => t.toLowerCase() === type)) continue;
    if (q && !pokemon.name.toLowerCase().includes(q)) continue;
    entries.push({ intel, pokemon });
  }

  entries.sort((a, b) => {
    if (sort === 'alpha') return a.pokemon.name.localeCompare(b.pokemon.name);
    if (sort === 'bst') return bst(b.pokemon.baseStats) - bst(a.pokemon.baseStats);
    return b.intel.usage - a.intel.usage; // 'usage'
  });

  return entries;
}

export function maxUsage(entries: LeaderboardEntry[]): number {
  return entries.reduce((m, e) => Math.max(m, e.intel.usage), 0);
}
