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
  lv: number;
  hp: number;
  types: HudType[];
  role: string;
  sprite: number;
  status: string | null;
  ability: string;
  item: string;
  nature: string;
  stats: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
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

export const HUD_TEAM: HudTeamMon[] = [
  {
    id: 'T1', name: 'Bulbasaur', dex: '#0001', lv: 52, hp: 1.0,
    types: ['grass', 'poison'], role: 'Lead', sprite: 1, status: null,
    ability: 'Overgrow', item: 'Miracle Seed', nature: 'Modest',
    stats: { hp: 65, atk: 49, def: 67, spa: 95, spd: 80, spe: 60 },
    moves: [
      { name: 'Giga Drain',   type: 'grass',  cat: 'S', pow: 75,  acc: 100, pp: 10 },
      { name: 'Sludge Bomb',  type: 'poison', cat: 'S', pow: 90,  acc: 100, pp: 10 },
      { name: 'Sleep Powder', type: 'grass',  cat: '-', pow: 0,   acc: 75,  pp: 15 },
      { name: 'Synthesis',    type: 'grass',  cat: '-', pow: 0,   acc: 100, pp: 5  },
    ],
  },
  {
    id: 'T2', name: 'Charizard', dex: '#0006', lv: 56, hp: 0.78,
    types: ['fire', 'flying'], role: 'Sweep', sprite: 6, status: null,
    ability: 'Solar Power', item: 'Heavy-Duty Boots', nature: 'Timid',
    stats: { hp: 78, atk: 84, def: 78, spa: 109, spd: 85, spe: 100 },
    moves: [
      { name: 'Flamethrower', type: 'fire',   cat: 'S', pow: 90,  acc: 100, pp: 15 },
      { name: 'Air Slash',    type: 'flying', cat: 'S', pow: 75,  acc: 95,  pp: 15 },
      { name: 'Solar Beam',   type: 'grass',  cat: 'S', pow: 120, acc: 100, pp: 10 },
      { name: 'Roost',        type: 'flying', cat: '-', pow: 0,   acc: 100, pp: 5  },
    ],
  },
  {
    id: 'T3', name: 'Gardevoir', dex: '#0282', lv: 54, hp: 0.92,
    types: ['psychic', 'fairy'], role: 'Wall', sprite: 282, status: null,
    ability: 'Trace', item: 'Choice Specs', nature: 'Modest',
    stats: { hp: 68, atk: 65, def: 65, spa: 125, spd: 115, spe: 80 },
    moves: [
      { name: 'Moonblast',   type: 'fairy',    cat: 'S', pow: 95,  acc: 100, pp: 15 },
      { name: 'Psyshock',    type: 'psychic',  cat: 'S', pow: 80,  acc: 100, pp: 10 },
      { name: 'Focus Blast', type: 'fighting', cat: 'S', pow: 120, acc: 70,  pp: 5  },
      { name: 'Trick',       type: 'psychic',  cat: '-', pow: 0,   acc: 100, pp: 10 },
    ],
  },
  {
    id: 'T4', name: 'Garchomp', dex: '#0445', lv: 55, hp: 0.41,
    types: ['dragon', 'ground'], role: 'Pivot', sprite: 445, status: 'psn',
    ability: 'Rough Skin', item: 'Loaded Dice', nature: 'Jolly',
    stats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
    moves: [
      { name: 'Earthquake',   type: 'ground', cat: 'P', pow: 100, acc: 100, pp: 10 },
      { name: 'Scale Shot',   type: 'dragon', cat: 'P', pow: 25,  acc: 90,  pp: 20 },
      { name: 'Stealth Rock', type: 'rock',   cat: '-', pow: 0,   acc: 100, pp: 20 },
      { name: 'Fire Fang',    type: 'fire',   cat: 'P', pow: 65,  acc: 95,  pp: 15 },
    ],
  },
  {
    id: 'T5', name: 'Hatterene', dex: '#0858', lv: 50, hp: 1.0,
    types: ['psychic', 'fairy'], role: 'Trick', sprite: 858, status: null,
    ability: 'Magic Bounce', item: 'Leftovers', nature: 'Bold',
    stats: { hp: 57, atk: 90, def: 95, spa: 136, spd: 103, spe: 29 },
    moves: [
      { name: 'Draining Kiss', type: 'fairy',   cat: 'S', pow: 50, acc: 100, pp: 10 },
      { name: 'Psychic',       type: 'psychic', cat: 'S', pow: 90, acc: 100, pp: 10 },
      { name: 'Calm Mind',     type: 'psychic', cat: '-', pow: 0,  acc: 100, pp: 20 },
      { name: 'Mystical Fire', type: 'fire',    cat: 'S', pow: 75, acc: 100, pp: 10 },
    ],
  },
  {
    id: 'T6', name: 'Metagross', dex: '#0376', lv: 58, hp: 0.66,
    types: ['steel', 'psychic'], role: 'Tank', sprite: 376, status: null,
    ability: 'Clear Body', item: 'Assault Vest', nature: 'Adamant',
    stats: { hp: 80, atk: 135, def: 130, spa: 95, spd: 90, spe: 70 },
    moves: [
      { name: 'Meteor Mash',  type: 'steel',   cat: 'P', pow: 90,  acc: 90,  pp: 10 },
      { name: 'Bullet Punch', type: 'steel',   cat: 'P', pow: 40,  acc: 100, pp: 30 },
      { name: 'Earthquake',   type: 'ground',  cat: 'P', pow: 100, acc: 100, pp: 10 },
      { name: 'Zen Headbutt', type: 'psychic', cat: 'P', pow: 80,  acc: 90,  pp: 15 },
    ],
  },
];

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
 * Radial nav tools. 10 hexes at 36° intervals starting at -90° (Pokédex
 * dead-center top). The 6-o'clock hex sits where the SYNC CORE label used to
 * breathe, so SyncCore lifts that label up under the orb.
 */
export const HUD_TOOLS: HudTool[] = [
  { id: 'pokedex',  label: 'Pokédex', glyph: 'P', angle: -90 },
  { id: 'team',     label: 'Team',    glyph: 'T', angle: -54 },
  { id: 'battle',   label: 'Battle',  glyph: 'X', angle: -18 },
  { id: 'session',  label: 'Live',    glyph: 'L', angle:  18 },
  { id: 'planner',  label: 'EV/IV',   glyph: 'E', angle:  54 },
  { id: 'pc',       label: 'PC Box',  glyph: 'B', angle:  90 },
  { id: 'spawns',   label: 'Spawns',  glyph: 'S', angle: 126 },
  { id: 'breeding', label: 'Breed',   glyph: 'O', angle: 162 },
  { id: 'smogon',   label: 'Meta',    glyph: 'M', angle: 198 },
  { id: 'draft',    label: 'Draft',   glyph: 'D', angle: 234 },
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
