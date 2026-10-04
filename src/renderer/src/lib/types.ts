export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface BaseStats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

export interface Pokemon {
  id: string;
  /** Showdown name, form included ("Venusaur-Mega"). */
  name: string;
  /** Set on alternate forms: the species name without the form ("Venusaur"). */
  baseSpecies?: string;
  /** Set on alternate forms: the form part of the name ("Mega", "Rapid-Strike"). */
  forme?: string;
  dex: number;
  types: string[];
  abilities: string[];
  hiddenAbilities: string[];
  baseStats: BaseStats;
  /** EVs earned for defeating this species. */
  evYield?: BaseStats;
  /** Fraction of males 0..1; -1 = genderless. */
  maleRatio?: number;
  /** Tier in the active format ("OU", "UU", "Uber", ...). */
  tier?: string;
  /** True when the active format bans this species. */
  banned?: boolean;
  eggGroups: string[];
  /** Decimeters. */
  height: number;
  /** Hectograms. */
  weight: number;
  /** Showdown species tags: legendary, mythical, paradox, restricted, ultra_beast. */
  labels: string[];
  /** `learn` is a level, "tm", "tutor", "egg", "event", or "legacy" (only older generations teach it). */
  moves: { learn: string; move: string }[];
}

export type HeldItemCategory = 'held' | 'berry' | 'mega' | 'plate' | 'other';

export interface HeldItem {
  id: string;
  name: string;
  category: HeldItemCategory;
}

export interface Move {
  id: string;
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  power: number;
  accuracy: number | true;
  pp: number;
  priority: number;
  desc: string;
  target: string;
  flags: string[];
}
