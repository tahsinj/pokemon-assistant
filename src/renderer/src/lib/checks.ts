/**
 * Checks for one species: who beats it one on one, from the box and from
 * the meta. Win chances come from the matchup model when it is downloaded
 * (ml/matchup.ts), otherwise from its heuristic.
 */
import type { PcPokemonRecord } from './bridgeTypes';
import type { BattlePokemonSpec } from './battle/types';
import { opponentSpec, pcSpec } from './matchup';
import { assumedOpponentSpec } from './opponentSet';
import type { SmogonBundle } from './smogon';
import type { Move, Pokemon } from './types';

export interface CheckCandidate {
  key: string;
  p: Pokemon;
  label: string;
  /** "Lv 78 - Box 1" style for box Pokémon, "12.3% usage" for meta ones. */
  sub: string;
  spec: BattlePokemonSpec;
}

/** The target as a typical competitive set at `level`. */
export function targetSpec(p: Pokemon, level: number, smogon: SmogonBundle | null, moves: Record<string, Move>): BattlePokemonSpec {
  const set = assumedOpponentSpec(p, level, smogon?.species[p.id] ?? null, moves, 'competitive');
  return opponentSpec({ p, level, set, assumedAbility: set.ability }, moves);
}

export function boxCandidates(
  mons: PcPokemonRecord[],
  pokemonById: Record<string, Pokemon>,
  moves: Record<string, Move>,
  boxName: (id: string) => string,
): CheckCandidate[] {
  return mons.flatMap((rec) => {
    const p = pokemonById[rec.speciesId];
    return p ? [{ key: rec.id, p, label: rec.nickname || p.name, sub: `Lv ${rec.level} · ${boxName(rec.boxId)}`, spec: pcSpec({ rec, p }, moves) }] : [];
  });
}

/** The format's most used species (not the target's own line), each with its typical set. */
export function metaCandidates(
  target: Pokemon,
  pokemonById: Record<string, Pokemon>,
  smogon: SmogonBundle | null,
  moves: Record<string, Move>,
  limit = 60,
): CheckCandidate[] {
  if (!smogon) return [];
  const base = (p: Pokemon) => p.baseSpecies ?? p.name;
  return Object.entries(smogon.species)
    .sort((a, b) => b[1].usage - a[1].usage)
    .flatMap(([id, intel]) => {
      const p = pokemonById[id];
      if (!p || p.banned || base(p) === base(target)) return [];
      return [{ key: id, p, label: p.name, sub: `${(intel.usage * 100).toFixed(1)}% usage`, spec: targetSpec(p, 100, smogon, moves) }];
    })
    .slice(0, limit);
}
