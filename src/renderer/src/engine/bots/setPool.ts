/**
 * Prior sets for the predictor inside the engine, where the format's usage
 * data may not be loaded: the random battle roles, which cover every species
 * a random team can hold. Callers with usage data pass its pool on top.
 */
import { TeamGenerators } from '@pkmn/randoms';
import { Dex, toID } from '@pkmn/sim';
import type { BaseStats, Pokemon } from '../../lib/types';
import type { CandidateSet, PredictorContext } from '../../lib/battle/predictor/types';

interface RandomRole {
  role: string;
  movepool: string[];
  abilities: string[];
  teraTypes?: string[];
}

const FULL_IVS: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
/** What random battles give every Pokémon; physical stats drop to 0 when no move needs them. */
const EVEN_EVS: BaseStats = { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 };

let randomPool: Record<string, CandidateSet[]> | null = null;

/** One candidate per role, ability and Tera type of each species' random battle sets. */
export function randomBattlePool(): Record<string, CandidateSet[]> {
  if (randomPool) return randomPool;
  const generator = TeamGenerators.getTeamGenerator('gen9randombattle') as unknown as {
    randomSets: Record<string, { sets: RandomRole[] }>;
  };
  const pool: Record<string, CandidateSet[]> = {};
  for (const [id, data] of Object.entries(generator.randomSets)) {
    const out: CandidateSet[] = [];
    for (const role of data.sets) {
      const physical = role.movepool.some((m) => Dex.moves.get(m).category === 'Physical');
      const teras = role.teraTypes?.length ? role.teraTypes : [null];
      const share = 1 / data.sets.length / role.abilities.length / teras.length;
      for (const ability of role.abilities) {
        for (const teraType of teras) {
          out.push({
            id: `${id}:${toID(role.role)}:${toID(ability)}:${toID(teraType ?? '')}`,
            label: role.role,
            nature: 'Hardy',
            ability,
            item: null,
            teraType,
            ivs: physical ? { ...FULL_IVS } : { ...FULL_IVS, atk: 0 },
            evs: physical ? { ...EVEN_EVS } : { ...EVEN_EVS, atk: 0 },
            moves: role.movepool,
            prior: share,
          });
        }
      }
    }
    if (out.length) pool[id] = out;
  }
  randomPool = pool;
  return pool;
}

/**
 * A predictor context that needs no dex bundle: species come from the
 * simulator's dex and sets from `extra` (usage sets) or the random battle
 * roles. Species in neither get no candidates.
 */
export function engineContext(extra: Record<string, CandidateSet[]> = {}): PredictorContext {
  const customSetPool = { ...randomBattlePool(), ...extra };
  const pokemonByName: Record<string, Pokemon> = {};
  for (const id of Object.keys(customSetPool)) {
    const species = Dex.species.get(id);
    if (species.exists) pokemonByName[species.name.toLowerCase()] = { id, name: species.name } as Pokemon;
  }
  return { pokemonByName, moves: {}, customSetPool };
}
