/**
 * Conversions from stored Pokémon (PC box records, saved-team members) into
 * the shapes the battle surfaces consume: BattlePage's CombatSpec data fields
 * and BattleSessionPage's makePokemon spec. Pure data mapping - no DOM, no
 * battle-engine imports (the session spec is typed structurally on purpose).
 */

import type { BaseStats } from './types';
import type { Pokemon } from './types';
import type { PcPokemonRecord, TeamMemberPersist } from './bridgeTypes';

/** Lowest common denominator of a stored mon, whatever its source. */
export interface CombatImportInput {
  speciesId: string | null;
  speciesDisplay: string;
  level: number;
  nature: string | null;
  ability: string | null;
  item: string | null;
  ivs: Partial<BaseStats> | null;
  evs: Partial<BaseStats> | null;
  moves: string[] | null;
}

export function fromPcRecord(rec: PcPokemonRecord): CombatImportInput {
  return {
    speciesId: rec.speciesId,
    speciesDisplay: rec.nickname || rec.speciesDisplay,
    level: rec.level,
    nature: rec.nature || null,
    ability: rec.ability || null,
    item: rec.item,
    ivs: rec.ivs,
    evs: rec.evs,
    moves: rec.moves.length ? rec.moves : null,
  };
}

/** Saved-team members carry no level - callers pick the assumption. */
export function fromTeamMember(m: TeamMemberPersist, level = 50): CombatImportInput {
  return {
    speciesId: m.speciesId,
    speciesDisplay: m.speciesDisplay,
    level,
    nature: m.nature,
    ability: m.ability,
    item: m.item,
    ivs: null,
    evs: (m.evs as Partial<BaseStats> | null) ?? null,
    moves: m.moves && m.moves.length ? m.moves : null,
  };
}

const FILL_31: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const FILL_0: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

/** The data fields of BattlePage's CombatSpec (UI-only fields excluded). */
export interface CombatFields {
  speciesName: string;
  level: number;
  nature: string;
  ability: string;
  item: string;
  ivs: BaseStats;
  evs: BaseStats;
  moves: [string, string, string, string];
}

function padMoves(own: string[] | null, fallback: string[]): [string, string, string, string] {
  const out = (own ?? []).slice(0, 4);
  while (out.length < 4) out.push(fallback[out.length] ?? '');
  return [out[0] ?? '', out[1] ?? '', out[2] ?? '', out[3] ?? ''];
}

export function toCombatFields(
  input: CombatImportInput,
  species: Pokemon,
  fallbackMoves: string[],
): CombatFields {
  return {
    speciesName: species.name,
    level: input.level,
    nature: input.nature ?? 'Hardy',
    ability: input.ability ?? species.abilities[0] ?? '',
    item: input.item ?? '',
    ivs: { ...FILL_31, ...(input.ivs ?? {}) },
    evs: { ...FILL_0, ...(input.evs ?? {}) },
    moves: padMoves(input.moves, fallbackMoves),
  };
}

/** Spec arg for battle/state's makePokemon - typed structurally to keep this lib light. */
export interface SessionSpec {
  speciesName: string;
  level: number;
  nature: string;
  ability: string;
  item: string | null;
  ivs: BaseStats;
  evs: BaseStats;
  moves: { name: string }[];
}

export function toSessionSpec(
  input: CombatImportInput,
  species: Pokemon,
  fallbackMoves: string[],
): SessionSpec {
  const fields = toCombatFields(input, species, fallbackMoves);
  return {
    speciesName: fields.speciesName,
    level: fields.level,
    nature: fields.nature,
    ability: fields.ability,
    item: input.item,
    ivs: fields.ivs,
    evs: fields.evs,
    moves: fields.moves.filter(Boolean).map((name) => ({ name })),
  };
}
