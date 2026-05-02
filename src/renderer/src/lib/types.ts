export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface BaseStats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

export interface Pokemon {
  id: string;
  name: string;
  dex: number;
  types: string[];
  abilities: string[];
  hiddenAbilities: string[];
  baseStats: BaseStats;
  evYield?: Record<string, number>;
  catchRate?: number;
  eggGroups: string[];
  height: number;
  weight: number;
  labels: string[];
  moves: { learn: string; move: string }[];
}

export type HeldItemCategory = 'held' | 'berry' | 'mega' | 'plate' | 'other';
export type HeldItemSource = 'showdown' | 'cobblemon';

export interface HeldItem {
  id: string;
  name: string;
  category: HeldItemCategory;
  source: HeldItemSource;
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

export interface SpawnEntry {
  bucket?: string;
  level?: string;
  weight?: number;
  biomes: string[];
  moonPhase?: string;
  canSeeSky?: boolean;
  minSkyLight?: number;
  maxSkyLight?: number;
  timeRange?: string;
  isRaining?: boolean;
  isThundering?: boolean;
  structures?: string[];
  presets: string[];
}
