import type { Pokemon, Move, SpawnEntry, HeldItem } from './types';
import type { SyncResult } from './battle/cobblemonSync';
import { loadSmogon, type SmogonBundle } from './smogon';
import {
  getGlobalRegistry,
  registerMoveOverride,
  registerAbilityOverride,
  registerItemOverride,
  type MoveOverride,
  type AbilityOverride,
  type ItemOverride,
} from './battle/overrides';

let cache: {
  pokemon: Pokemon[];
  pokemonById: Record<string, Pokemon>;
  moves: Record<string, Move>;
  items: HeldItem[];
  spawns: Record<string, SpawnEntry[]>;
  /** NatDex OU competitive intel; null when smogon.json hasn't been generated. */
  smogon: SmogonBundle | null;
  /** Result of the auto-sync against Showdown when species data was loaded. */
  syncResult: SyncResult;
} | null = null;

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} failed (${r.status})`);
  return r.json() as Promise<T>;
}

/**
 * Optional runtime override manifest. When `public/data/cobblemon-overrides.json`
 * exists it is loaded and merged into the global registry. Shape:
 *
 *   {
 *     "moves":     [{ id, name, basePower?, type?, category?, priority?, note? }, ...],
 *     "abilities": [{ id, name, note }, ...],
 *     "items":     [{ id, name, note }, ...]
 *   }
 *
 * Species overrides are derived automatically from `pokemon.json` - no need to
 * duplicate them here.
 */
interface RuntimeOverrideManifest {
  moves?: Omit<MoveOverride, 'source'>[];
  abilities?: Omit<AbilityOverride, 'source'>[];
  items?: Omit<ItemOverride, 'source'>[];
}

async function loadRuntimeOverrides(): Promise<void> {
  // The overrides file is optional, and "absent" looks different per
  // environment: http 404, a thrown TypeError under file:// (packaged app),
  // or Vite's SPA fallback serving index.html with a 200. All of those are
  // silent no-ops - only a present-but-malformed file deserves a warning.
  let text: string;
  try {
    const r = await fetch('./data/cobblemon-overrides.json');
    if (!r.ok) return;
    text = await r.text();
  } catch {
    return;
  }
  if (!text.trim() || text.trimStart().startsWith('<')) return;
  try {
    const manifest = JSON.parse(text) as RuntimeOverrideManifest;
    const reg = getGlobalRegistry();
    for (const m of manifest.moves ?? []) registerMoveOverride(reg, { ...m, source: 'USER' });
    for (const a of manifest.abilities ?? []) registerAbilityOverride(reg, { ...a, source: 'USER' });
    for (const i of manifest.items ?? []) registerItemOverride(reg, { ...i, source: 'USER' });
  } catch (e) {
    // Don't crash the app on a malformed overrides file - log and continue.
    console.warn('Failed to load runtime overrides:', e);
  }
}

export async function loadData() {
  if (cache) return cache;
  const [pokemon, moves, items, spawns, smogon] = await Promise.all([
    fetchJson<Pokemon[]>('./data/pokemon.json', 'Pokémon data'),
    fetchJson<Record<string, Move>>('./data/moves.json', 'Moves data'),
    fetchJson<HeldItem[]>('./data/items.json', 'Held items data'),
    fetchJson<Record<string, SpawnEntry[]>>('./data/spawns.json', 'Spawn data'),
    loadSmogon(),
  ]);
  const pokemonById: Record<string, Pokemon> = {};
  for (const p of pokemon) pokemonById[p.id] = p;

  // Auto-sync Cobblemon species into the override registry. This is the
  // main source of overrides: every base-stat / typing / ability divergence
  // gets propagated to the damage engine without manual curation.
  // Dynamic import keeps the battle engine (and @smogon/calc's data tables)
  // out of the entry chunk; the sync still completes before loadData resolves.
  const { syncCobblemonSpecies } = await import('./battle/cobblemonSync');
  const syncResult = syncCobblemonSpecies(pokemon);
  await loadRuntimeOverrides();

  cache = { pokemon, pokemonById, moves, items, spawns, smogon, syncResult };
  return cache;
}
