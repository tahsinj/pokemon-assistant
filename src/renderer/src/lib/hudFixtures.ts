export type HudType =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice'
  | 'fighting' | 'poison' | 'ground' | 'flying' | 'psychic' | 'bug'
  | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy';

export interface HudTrainer {
  name: string;
  handle: string;
  level: number;
  xp: number;
  title: string;
  badges: number;
  region: string;
  streak: number;
  caught: number;
  seen: number;
  total: number;
  wins: number;
  losses: number;
  biome: string;
}

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

export interface HudActiveCreature {
  id: string;
  name: string;
  dex: string;
  lv: number;
  types: HudType[];
  ability: string;
  nature: string;
  item: string;
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  moves: { name: string; type: HudType; cat: string; pow: number; acc: number; pp: number }[];
  sprite: number;
}

export interface HudRecent {
  kind: 'catch' | 'battle' | 'spawn' | 'trade' | 'level';
  text: string;
  meta: string;
}

export interface HudAlert {
  sev: 'warn' | 'info' | 'ok';
  text: string;
}

export interface HudTool {
  id: string;
  label: string;
  glyph: string;
  angle: number;
}

export const HUD_TRAINER: HudTrainer = {
  name: 'Kai Nakamura',
  handle: '@kaitrains',
  level: 47,
  xp: 0.62,
  title: 'Verdant Pathfinder',
  badges: 6,
  region: 'Cobble Hollow',
  streak: 12,
  caught: 318,
  seen: 542,
  total: 851,
  wins: 87,
  losses: 14,
  biome: 'Verdant Dusk',
};

export const HUD_ACTIVE: HudActiveCreature = {
  id: 'T2',
  name: 'Charizard',
  dex: '#0006',
  lv: 56,
  types: ['fire', 'flying'],
  ability: 'Solar Power',
  nature: 'Timid',
  item: 'Heavy-Duty Boots',
  stats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
  moves: [
    { name: 'Flamethrower', type: 'fire',   cat: 'S', pow: 90,  acc: 100, pp: 15 },
    { name: 'Air Slash',    type: 'flying', cat: 'S', pow: 75,  acc: 95,  pp: 15 },
    { name: 'Solar Beam',   type: 'grass',  cat: 'S', pow: 120, acc: 100, pp: 10 },
    { name: 'Roost',        type: 'flying', cat: '-', pow: 0,   acc: 100, pp: 5  },
  ],
  sprite: 6,
};

export const HUD_RECENTS: HudRecent[] = [
  { kind: 'catch',  text: 'Caught Hatterene · Lv 50', meta: 'Misty Glade · 04:12' },
  { kind: 'battle', text: 'Defeated Rival Mira 6-3', meta: 'Gym 6 · 02:48' },
  { kind: 'spawn',  text: 'Rare spawn near -312, 71, 488', meta: 'Verdant Dusk' },
  { kind: 'trade',  text: 'Trade complete: Larvitar ↔ Riolu', meta: '@flux' },
  { kind: 'level',  text: 'Charizard reached Lv 56', meta: '+1 SpA · +1 Spe' },
];

export const HUD_ALERTS: HudAlert[] = [
  { sev: 'warn', text: 'Garchomp poisoned · 41% HP' },
  { sev: 'info', text: 'Egg ready in 22 min' },
  { sev: 'ok',   text: 'Daily quest streak: 12 days' },
];

/**
 * Radial nav tools. 11 hexes at 360/11 ≈ 32.73° intervals starting at -90°
 * (Pokédex dead-center top). SyncCore reads each tool's `angle` directly, so the
 * count is arbitrary - just keep the spacing even.
 */
export const HUD_TOOLS: HudTool[] = [
  { id: 'pokedex',  label: 'Pokédex', glyph: 'P', angle:  -90 },
  { id: 'moves',    label: 'Moves',   glyph: 'V', angle: -57.27 },
  { id: 'team',     label: 'Team',    glyph: 'T', angle: -24.55 },
  { id: 'battle',   label: 'Battle',  glyph: 'X', angle:   8.18 },
  { id: 'session',  label: 'Live',    glyph: 'L', angle:  40.91 },
  { id: 'planner',  label: 'EV/IV',   glyph: 'E', angle:  73.64 },
  { id: 'pc',       label: 'PC Box',  glyph: 'B', angle: 106.36 },
  { id: 'spawns',   label: 'Spawns',  glyph: 'S', angle: 139.09 },
  { id: 'breeding', label: 'Breed',   glyph: 'O', angle: 171.82 },
  { id: 'smogon',   label: 'Meta',    glyph: 'M', angle: 204.55 },
  { id: 'draft',    label: 'Draft',   glyph: 'D', angle: 237.27 },
];

export const CP_SPRITE = (n: number): string =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;

export const CP_SPRITE_HD = (n: number): string =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`;

export type BiomeName = 'Verdant Dusk' | 'Ember Caldera' | 'Tidal Reef' | 'Voltaic Storm' | 'Frostspire';

export const BIOMES: Record<BiomeName, { a: string; b: string; c: string; d: string; accent: string; accent2: string }> = {
  'Verdant Dusk':  { a: '#0a3b2e', b: '#1b6d63', c: '#f5a623', d: '#08131c', accent: '#ffc636', accent2: '#56e6c2' },
  'Ember Caldera': { a: '#3a0a14', b: '#7a1c1c', c: '#ff9a3d', d: '#180404', accent: '#ff8a3d', accent2: '#ffd34d' },
  'Tidal Reef':    { a: '#0a1f4d', b: '#0e5a8a', c: '#6ad7ff', d: '#040c1e', accent: '#6ad7ff', accent2: '#56e6c2' },
  'Voltaic Storm': { a: '#2a103f', b: '#572b80', c: '#ffd34d', d: '#0a0418', accent: '#ffd34d', accent2: '#c08aff' },
  'Frostspire':    { a: '#0a2030', b: '#3d5e7a', c: '#a3e6ff', d: '#040c14', accent: '#a3e6ff', accent2: '#cfe9ff' },
};
