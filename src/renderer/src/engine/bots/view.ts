/**
 * Calc inputs from a live battle, seen from one side. Bots know their own
 * sets in full; for the foe they use only what a player could see (species,
 * level, HP, boosts, status, moves it has used) and assume an even spread.
 */
import type { Battle, Pokemon as SimPokemon } from '@pkmn/sim';
import {
  EMPTY_SIDE,
  NEUTRAL_EVS,
  NEUTRAL_IVS,
  type BattlePokemonSpec,
  type FieldSpec,
  type SideSpec,
  type Terrain,
  type Weather,
} from '../../lib/battle/types';
import type { SideId } from '../types';

const WEATHER: Record<string, Weather> = {
  raindance: 'Rain',
  primordialsea: 'Heavy Rain',
  sunnyday: 'Sun',
  desolateland: 'Harsh Sunshine',
  sandstorm: 'Sand',
  snowscape: 'Snow',
  hail: 'Hail',
  deltastream: 'Strong Winds',
};

const TERRAIN: Record<string, Terrain> = {
  electricterrain: 'Electric',
  grassyterrain: 'Grassy',
  mistyterrain: 'Misty',
  psychicterrain: 'Psychic',
};

/** The spread assumed for a foe whose set is unknown (what random battles use). */
const EVEN_EVS = { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 };

type Status = BattlePokemonSpec['status'];

function common(p: SimPokemon): Omit<BattlePokemonSpec, 'nature' | 'ability' | 'item' | 'ivs' | 'evs' | 'moves'> {
  return {
    speciesName: p.species.name,
    level: p.level,
    teraType: p.terastallized ?? p.teraType,
    isTerastallized: !!p.terastallized,
    currentHPPercent: p.maxhp ? (100 * p.hp) / p.maxhp : 0,
    boosts: { atk: p.boosts.atk, def: p.boosts.def, spa: p.boosts.spa, spd: p.boosts.spd, spe: p.boosts.spe },
    status: (p.status || undefined) as Status,
  };
}

export function ownSpec(p: SimPokemon): BattlePokemonSpec {
  return {
    ...common(p),
    nature: p.set.nature || 'Hardy',
    ability: p.getAbility().name,
    item: p.getItem().name,
    ivs: { ...NEUTRAL_IVS, ...p.set.ivs },
    evs: { ...NEUTRAL_EVS, ...p.set.evs },
    moves: p.moveSlots.map((m) => ({ name: m.move })),
  };
}

export function foeSpec(p: SimPokemon): BattlePokemonSpec {
  return {
    ...common(p),
    nature: 'Hardy',
    ivs: { ...NEUTRAL_IVS },
    evs: { ...EVEN_EVS },
    moves: p.moveSlots.filter((m) => m.used).map((m) => ({ name: m.move })),
  };
}

function sideSpec(battle: Battle, side: SideId): SideSpec {
  const c = battle[side].sideConditions;
  return {
    ...EMPTY_SIDE,
    spikes: Math.min(3, c.spikes?.layers ?? 0) as SideSpec['spikes'],
    stealthRock: !!c.stealthrock,
    isReflect: !!c.reflect,
    isLightScreen: !!c.lightscreen,
    isAuroraVeil: !!c.auroraveil,
    isTailwind: !!c.tailwind,
  };
}

/** Field for a move used by `attacker` against the other side. */
export function fieldFor(battle: Battle, attacker: SideId): FieldSpec {
  const defender: SideId = attacker === 'p1' ? 'p2' : 'p1';
  return {
    weather: WEATHER[battle.field.weather] ?? '',
    terrain: TERRAIN[battle.field.terrain] ?? '',
    isGravity: !!battle.field.pseudoWeather.gravity,
    attackerSide: sideSpec(battle, attacker),
    defenderSide: sideSpec(battle, defender),
  };
}
