import type { HeldItem, Move, Pokemon } from './types';
import type { FormatId, FormatProfile } from './formats';
import { loadUsage, type SmogonBundle } from './smogon';

/** One species as scripts/build-dex.mjs writes it: every format it appears in. */
export interface DexSpecies extends Omit<Pokemon, 'tier' | 'banned'> {
  formats: Partial<Record<FormatId, { tier: string; banned: boolean }>>;
}

/** `past` marks moves and items only formats with past mechanics allow. */
export type DexMove = Move & { past?: true };
export type DexItem = HeldItem & { past?: true };

export interface DexFile {
  formats: FormatId[];
  species: DexSpecies[];
  moves: Record<string, DexMove>;
  items: DexItem[];
}

export interface FormatData {
  format: FormatProfile;
  pokemon: Pokemon[];
  pokemonById: Record<string, Pokemon>;
  moves: Record<string, Move>;
  items: HeldItem[];
  /** Usage stats and sets for the format; null when the bundle is missing. */
  smogon: SmogonBundle | null;
}

/** The species, moves and items a format allows, shaped the way the tools expect. */
export function viewForFormat(dex: DexFile, format: FormatProfile): Omit<FormatData, 'format' | 'smogon'> {
  const moves: Record<string, Move> = {};
  for (const [id, { past, ...move }] of Object.entries(dex.moves)) {
    if (past && !format.allowsPastMechanics) continue;
    moves[id] = move;
  }

  const items: HeldItem[] = [];
  for (const { past, ...item } of dex.items) {
    if (past && !format.allowsPastMechanics) continue;
    items.push(item);
  }

  const pokemon: Pokemon[] = [];
  const pokemonById: Record<string, Pokemon> = {};
  for (const { formats, ...species } of dex.species) {
    const entry = formats[format.id];
    if (!entry) continue;
    const learnset = species.moves.filter(
      (m) => moves[m.move] && (format.allowsLegacyMoves || m.learn !== 'legacy'),
    );
    const p: Pokemon = { ...species, tier: entry.tier, banned: entry.banned, moves: learnset };
    pokemon.push(p);
    pokemonById[p.id] = p;
  }

  return { pokemon, pokemonById, moves, items };
}

async function fetchJson<T>(url: string, label: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} failed (${r.status})`);
  return r.json() as Promise<T>;
}

let dexFile: Promise<DexFile> | null = null;
const loaded = new Map<FormatId, FormatData>();

export async function loadData(format: FormatProfile): Promise<FormatData> {
  const hit = loaded.get(format.id);
  if (hit) return hit;
  dexFile ??= fetchJson<DexFile>('./data/dex.json', 'Pokémon data');
  let dex: DexFile;
  try {
    dex = await dexFile;
  } catch (e) {
    dexFile = null;
    throw e;
  }
  const smogon = await loadUsage(format.id);
  const data: FormatData = { format, ...viewForFormat(dex, format), smogon };
  loaded.set(format.id, data);
  return data;
}
