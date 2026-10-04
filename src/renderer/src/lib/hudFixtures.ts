export type HudType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface HudMove {
  name: string;
  type: HudType;
  cat: string;
  pow: number;
  acc: number;
  pp: number;
}

export interface HudTeamMon {
  id: string;
  name: string;
  dex: string;
  /** Live level - only known when fed by the mod bridge; absent for saved builds. */
  lv?: number;
  /** Live HP fraction 0..1 - only known in a live battle; absent for saved builds. */
  hp?: number;
  types: HudType[];
  role: string;
  sprite: number;
  status: string | null;
  ability: string;
  item: string;
  nature: string;
  /** Displayed stat numbers: real computed stats (base + IVs/EVs/nature at `statLevel`). */
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  /** Resolved IVs used for `stats` (default 31). */
  ivs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  /** Resolved EVs used for `stats` (default 0). */
  evs?: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  /** Species base-stat total (always base, independent of `stats`). */
  bst?: number;
  /** Level the displayed `stats` were computed at. */
  statLevel?: number;
  /** True when `statLevel` is the assumed competitive default (100), not a stored level. */
  levelAssumed?: boolean;
  moves: HudMove[];
}

// Sprite URLs resolve through lib/sprites.ts (local sprites first, then the
// remote fallback). Keep hardcoded sprite URLs out of this file.

export type BiomeName = 'Verdant Dusk' | 'Ember Caldera' | 'Tidal Reef' | 'Voltaic Storm' | 'Frostspire';

export const BIOMES: Record<BiomeName, { a: string; b: string; c: string; d: string; accent: string; accent2: string }> = {
  'Verdant Dusk':  { a: '#0a3b2e', b: '#1b6d63', c: '#f5a623', d: '#08131c', accent: '#ffc636', accent2: '#56e6c2' },
  'Ember Caldera': { a: '#3a0a14', b: '#7a1c1c', c: '#ff9a3d', d: '#180404', accent: '#ff8a3d', accent2: '#ffd34d' },
  'Tidal Reef':    { a: '#0a1f4d', b: '#0e5a8a', c: '#6ad7ff', d: '#040c1e', accent: '#6ad7ff', accent2: '#56e6c2' },
  'Voltaic Storm': { a: '#2a103f', b: '#572b80', c: '#ffd34d', d: '#0a0418', accent: '#ffd34d', accent2: '#c08aff' },
  'Frostspire':    { a: '#0a2030', b: '#3d5e7a', c: '#a3e6ff', d: '#040c14', accent: '#a3e6ff', accent2: '#cfe9ff' },
};
