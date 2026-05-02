import type { BaseStats, StatKey } from '../types';

export type Generation = 9;

export interface MoveSlot {
  name: string;
}

/**
 * A minimal battle-ready Pokémon spec. This is the flat calc input shape;
 * full per-turn volatile state lives in BattleState.
 */
export interface BattlePokemonSpec {
  speciesName: string;
  level: number;
  nature: string;
  ability?: string;
  item?: string;
  teraType?: string;
  isTerastallized?: boolean;
  ivs: BaseStats;
  evs: BaseStats;
  moves: MoveSlot[];
  currentHPPercent?: number;
  boosts?: Partial<Record<StatKey, number>>;
  status?: 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';
}

export type Weather =
  | 'Sun'
  | 'Rain'
  | 'Sand'
  | 'Snow'
  | 'Hail'
  | 'Harsh Sunshine'
  | 'Heavy Rain'
  | 'Strong Winds'
  | '';

export type Terrain = 'Electric' | 'Grassy' | 'Misty' | 'Psychic' | '';

export interface FieldSpec {
  weather: Weather;
  terrain: Terrain;
  isGravity: boolean;
  attackerSide: SideSpec;
  defenderSide: SideSpec;
}

export interface SideSpec {
  spikes: 0 | 1 | 2 | 3;
  steelsurge: boolean;
  stealthRock: boolean;
  isReflect: boolean;
  isLightScreen: boolean;
  isAuroraVeil: boolean;
  isTailwind: boolean;
}

export const EMPTY_SIDE: SideSpec = {
  spikes: 0,
  steelsurge: false,
  stealthRock: false,
  isReflect: false,
  isLightScreen: false,
  isAuroraVeil: false,
  isTailwind: false,
};

export const EMPTY_FIELD: FieldSpec = {
  weather: '',
  terrain: '',
  isGravity: false,
  attackerSide: { ...EMPTY_SIDE },
  defenderSide: { ...EMPTY_SIDE },
};

export const NEUTRAL_IVS: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const NEUTRAL_EVS: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
