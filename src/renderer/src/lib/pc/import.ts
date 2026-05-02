import type { PcPokemonRecord, SavePcPokemonPayload, PcGender } from '../bridgeTypes';
import type { Pokemon } from '../types';
import { parseShowdownTeam, type ParsedShowdownMon } from '../showdownTeam';
import { buildSpeciesFuse, resolveSpeciesName } from '../fuzzySpecies';
import { DEFAULT_IVS, PC_SLOTS_PER_BOX, ZERO_EVS, normalizeMoves } from './defaults';

export type PcShowdownImportMode = 'fill' | 'replace';

export interface PcShowdownImportResult {
  placed: number;
  skippedUnknown: string[];
  skippedFull: number;
}

export const pcShowdownCacheKey = (boxId: string) => `cobblemon-pc-showdown-${boxId}`;

function toGender(g?: string): PcGender {
  if (g === 'male' || g === 'female') return g;
  return 'genderless';
}

function spreadFromPartial(
  partial: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>,
  fallback: typeof DEFAULT_IVS,
): typeof DEFAULT_IVS {
  return {
    hp: partial.hp ?? fallback.hp,
    atk: partial.atk ?? fallback.atk,
    def: partial.def ?? fallback.def,
    spa: partial.spa ?? fallback.spa,
    spd: partial.spd ?? fallback.spd,
    spe: partial.spe ?? fallback.spe,
  };
}

export function parsedToPcPayload(
  block: ParsedShowdownMon,
  species: Pokemon,
  boxId: string,
  slot: number,
  id?: string,
): SavePcPokemonPayload {
  const ability =
    block.ability && species.abilities.concat(species.hiddenAbilities).includes(block.ability)
      ? block.ability
      : species.abilities[0] ?? species.hiddenAbilities[0] ?? '';

  return {
    id,
    boxId,
    slot,
    speciesId: species.id,
    speciesDisplay: species.name,
    nickname: block.nickname ?? null,
    level: block.level ?? 50,
    gender: toGender(block.gender),
    nature: block.nature ?? 'Hardy',
    ability,
    item: block.item ?? null,
    ivs: spreadFromPartial(block.ivs, DEFAULT_IVS),
    evs: spreadFromPartial(block.evs, ZERO_EVS),
    moves: normalizeMoves(block.moves),
    notes: null,
  };
}

export async function importPcFromShowdown(opts: {
  paste: string;
  boxId: string;
  mode: PcShowdownImportMode;
  speciesFuse: ReturnType<typeof buildSpeciesFuse>;
  occupants: PcPokemonRecord[];
  save: (payload: SavePcPokemonPayload) => Promise<{ id: string }>;
  deleteMon: (id: string) => Promise<void>;
  maxSlots?: number;
}): Promise<PcShowdownImportResult> {
  const maxSlots = opts.maxSlots ?? PC_SLOTS_PER_BOX;
  const parsed = parseShowdownTeam(opts.paste, { maxMons: maxSlots });

  if (opts.mode === 'replace') {
    await Promise.all(opts.occupants.map((o) => opts.deleteMon(o.id)));
  }

  const used = opts.mode === 'replace' ? new Set<number>() : new Set(opts.occupants.map((o) => o.slot));
  let nextSlot = 0;
  let placed = 0;
  let skippedFull = 0;
  const skippedUnknown: string[] = [];

  for (const block of parsed) {
    const species = resolveSpeciesName(opts.speciesFuse, block.species);
    if (!species) {
      skippedUnknown.push(block.species);
      continue;
    }
    let slot = nextSlot;
    if (opts.mode === 'fill') {
      while (slot < maxSlots && used.has(slot)) slot++;
    }
    if (slot >= maxSlots) {
      skippedFull++;
      continue;
    }
    used.add(slot);
    nextSlot = slot + 1;
    await opts.save(parsedToPcPayload(block, species, opts.boxId, slot));
    placed++;
  }

  return { placed, skippedUnknown, skippedFull };
}
