/**
 * Field synergy for Classic team building: weather, terrain, Trick Room and
 * screens. A setter scores with the teammates that gain from its field; two
 * automatic weathers (or terrains) on one team, an abuser with no setter, or
 * Aurora Veil with no snow cost points.
 *
 * Pure: traits come from a Pokémon's types, stats, ability, item and moves.
 */
import type { Pokemon } from './types';

export type Field = 'sun' | 'rain' | 'sand' | 'snow' | 'electric' | 'psychic' | 'grassy' | 'misty' | 'trickroom';

const WEATHERS: Field[] = ['sun', 'rain', 'sand', 'snow'];
const TERRAINS: Field[] = ['electric', 'psychic', 'grassy', 'misty'];

const FIELD_NAMES: Record<Field, string> = {
  sun: 'Sun',
  rain: 'Rain',
  sand: 'Sand',
  snow: 'Snow',
  electric: 'Electric Terrain',
  psychic: 'Psychic Terrain',
  grassy: 'Grassy Terrain',
  misty: 'Misty Terrain',
  trickroom: 'Trick Room',
};

export interface FieldTraits {
  name: string;
  /** Fields it sets: 1 from an ability (automatic), 0.6 from a move. */
  sets: Partial<Record<Field, number>>;
  /** How much it gains (or loses, below 0) under each field. */
  uses: Partial<Record<Field, number>>;
  /** Fields it barely works without (Swift Swim, Chlorophyll, ...). */
  needs: Field[];
  /** Reflect and Light Screen: 1 for both, 0.5 for one. */
  screens: number;
  /** Has Aurora Veil, which only works in snow. */
  veil: boolean;
  /** A setup sweeper, which screens help most. */
  sweeper: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const SETTER_ABILITIES: Record<string, Field> = {
  drought: 'sun',
  orichalcumpulse: 'sun',
  desolateland: 'sun',
  drizzle: 'rain',
  primordialsea: 'rain',
  sandstream: 'sand',
  snowwarning: 'snow',
  electricsurge: 'electric',
  hadronengine: 'electric',
  psychicsurge: 'psychic',
  grassysurge: 'grassy',
  mistysurge: 'misty',
};

const SETTER_MOVES: Record<string, Field> = {
  sunnyday: 'sun',
  raindance: 'rain',
  sandstorm: 'sand',
  snowscape: 'snow',
  hail: 'snow',
  electricterrain: 'electric',
  psychicterrain: 'psychic',
  grassyterrain: 'grassy',
  mistyterrain: 'misty',
  trickroom: 'trickroom',
};

/** [field, gain, needs the field]. Booster Energy covers Protosynthesis and Quark Drive. */
const USER_ABILITIES: Record<string, [Field, number, boolean]> = {
  chlorophyll: ['sun', 1, true],
  solarpower: ['sun', 1, true],
  protosynthesis: ['sun', 1, false],
  flowergift: ['sun', 0.5, false],
  harvest: ['sun', 0.5, false],
  swiftswim: ['rain', 1, true],
  hydration: ['rain', 0.5, false],
  raindish: ['rain', 0.3, false],
  dryskin: ['rain', 0.3, false],
  sandrush: ['sand', 1, true],
  sandforce: ['sand', 0.8, false],
  sandveil: ['sand', 0.3, false],
  slushrush: ['snow', 1, true],
  icebody: ['snow', 0.3, false],
  snowcloak: ['snow', 0.3, false],
  iceface: ['snow', 0.5, false],
  quarkdrive: ['electric', 1, false],
  surgesurfer: ['electric', 1, true],
};

const USER_MOVES: Record<string, [Field, number][]> = {
  solarbeam: [['sun', 0.5]],
  solarblade: [['sun', 0.5]],
  hydrosteam: [['sun', 0.8]],
  growth: [['sun', 0.3]],
  thunder: [['rain', 0.4]],
  hurricane: [['rain', 0.4]],
  electroshot: [['rain', 0.6]],
  blizzard: [['snow', 0.4]],
  weatherball: [['sun', 0.4], ['rain', 0.4], ['sand', 0.4], ['snow', 0.4]],
  risingvoltage: [['electric', 0.6]],
  expandingforce: [['psychic', 0.6]],
  grassyglide: [['grassy', 0.6]],
  mistyexplosion: [['misty', 0.4]],
  terrainpulse: [['electric', 0.4], ['psychic', 0.4], ['grassy', 0.4], ['misty', 0.4]],
};

/** The ability that matters in battle: a Mega's own, else the set's. */
export function battleAbility(
  p: Pokemon,
  ability: string,
  item: string | null,
  pokemonById: Record<string, Pokemon>,
): string {
  if (p.forme?.startsWith('Mega') || p.forme === 'Primal') return norm(p.abilities[0] ?? ability);
  const stone = norm(item ?? '');
  if (stone && stone !== 'eviolite' && /itex?y?$/.test(stone)) {
    const suffix = stone.endsWith('itex') ? 'x' : stone.endsWith('itey') ? 'y' : '';
    const mega = pokemonById[`${p.id}mega${suffix}`];
    if (mega?.abilities[0]) return norm(mega.abilities[0]);
  }
  return norm(ability || p.abilities[0] || '');
}

/**
 * What a Pokémon sets and needs. `attacker` is false for walls, whose STAB
 * gains from a weather or terrain don't count.
 */
export function fieldTraits(
  p: Pokemon,
  ability: string,
  item: string | null,
  moveIds: string[],
  opts: { attacker: boolean; sweeper: boolean },
): FieldTraits {
  const sets: FieldTraits['sets'] = {};
  const uses: FieldTraits['uses'] = {};
  const needs: Field[] = [];
  const gain = (f: Field, v: number) => {
    uses[f] = (uses[f] ?? 0) + v;
  };
  const moves = new Set(moveIds.map(norm));
  const ab = norm(ability);

  const abilityField = SETTER_ABILITIES[ab];
  if (abilityField) sets[abilityField] = 1;
  for (const m of moves) {
    const f = SETTER_MOVES[m];
    if (f && !sets[f]) sets[f] = 0.6;
  }

  const user = USER_ABILITIES[ab];
  if (user) {
    const [f, v, need] = user;
    const booster = norm(item ?? '') === 'boosterenergy';
    gain(f, booster ? 0.3 : v);
    if (need) needs.push(f);
  }
  for (const m of moves) for (const [f, v] of USER_MOVES[m] ?? []) gain(f, v);

  const types = new Set(p.types.map(norm));
  if (opts.attacker) {
    if (types.has('fire')) {
      gain('sun', 0.3);
      gain('rain', -0.3);
    }
    if (types.has('water')) {
      gain('rain', 0.3);
      gain('sun', -0.3);
    }
    if (types.has('electric')) gain('electric', 0.3);
    if (types.has('psychic')) gain('psychic', 0.3);
    if (types.has('grass')) gain('grassy', 0.3);
  }
  if (types.has('rock')) gain('sand', 0.3);
  if (types.has('ice')) gain('snow', 0.3);

  const b = p.baseStats;
  if (b.spe <= 55 && Math.max(b.atk, b.spa) >= 95) gain('trickroom', 1);

  const veil = moves.has('auroraveil');
  if (veil && !sets.snow) needs.push('snow');

  return {
    name: p.name,
    sets,
    uses,
    needs,
    screens: (moves.has('reflect') ? 0.5 : 0) + (moves.has('lightscreen') ? 0.5 : 0),
    veil,
    sweeper: opts.sweeper,
  };
}

export interface FieldSynergy {
  score: number;
  /** One line per synergy or clash, for the team card. */
  notes: string[];
}

/**
 * Field score for a team. Each setter's field counts the gains of the other
 * members (capped); automatic weathers and terrains that overwrite each other,
 * needs no teammate sets, and Aurora Veil without snow take points off.
 */
export function fieldSynergy(team: FieldTraits[]): FieldSynergy {
  let score = 0;
  const notes: string[] = [];
  const set = (f: Field) => team.some((m) => (m.sets[f] ?? 0) > 0);

  for (const f of [...WEATHERS, ...TERRAINS, 'trickroom'] as Field[]) {
    let setter = -1;
    for (let i = 0; i < team.length; i++) {
      if ((team[i].sets[f] ?? 0) > (setter < 0 ? 0 : team[setter].sets[f] ?? 0)) setter = i;
    }
    if (setter < 0) continue;
    let gain = 0;
    const abusers: string[] = [];
    team.forEach((m, i) => {
      if (i === setter) return;
      const v = m.uses[f] ?? 0;
      gain += v;
      if (v >= 0.5) abusers.push(m.name);
    });
    gain = Math.max(-1.5, Math.min(3, gain));
    score += 0.6 * (team[setter].sets[f] ?? 0) * gain;
    if (abusers.length) notes.push(`${FIELD_NAMES[f]}: ${team[setter].name} sets it for ${abusers.join(', ')}`);
  }

  for (const group of [WEATHERS, TERRAINS]) {
    const auto = group.filter((f) => team.some((m) => m.sets[f] === 1));
    if (auto.length > 1) {
      score -= 1.5 * (auto.length - 1);
      notes.push(`Clash: ${auto.map((f) => FIELD_NAMES[f]).join(' and ')} overwrite each other`);
    }
  }

  for (const m of team) {
    for (const f of m.needs) {
      if (set(f)) continue;
      score -= 0.5;
      notes.push(
        m.veil && f === 'snow'
          ? `${m.name}: Aurora Veil fails without snow`
          : `${m.name}: needs ${FIELD_NAMES[f]}, which no teammate sets`,
      );
    }
  }

  // Screens: a dual-screens (or Aurora Veil in snow) setter and the sweepers it covers.
  let screens = -1;
  team.forEach((m, i) => {
    const s = Math.max(m.screens, m.veil && set('snow') ? 1 : 0);
    if (s > 0 && (screens < 0 || s > screenStrength(team[screens], set('snow')))) screens = i;
  });
  if (screens >= 0) {
    const sweepers = team.filter((m, i) => i !== screens && m.sweeper).map((m) => m.name);
    if (sweepers.length) {
      score += 0.5 * screenStrength(team[screens], set('snow')) * Math.min(2, sweepers.length);
      notes.push(`Screens: ${team[screens].name} sets them up for ${sweepers.join(', ')}`);
    }
  }

  return { score, notes };
}

function screenStrength(m: FieldTraits, snow: boolean): number {
  return Math.max(m.screens, m.veil && snow ? 1 : 0);
}
