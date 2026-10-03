/**
 * Set generator - produces archetypal candidate sets for an opponent species
 * from its base stats, types, abilities, and learnset. This is the
 * "uniform prior over a small finite pool" baseline; a richer
 * usage-statistics-backed prior can be layered on top.
 */

import type { BaseStats, Move, Pokemon } from '../../types';
import { learnableMoves, scoreMove } from '../../recommender';
import type { Archetype, CandidateSet, PredictorContext } from './types';

const NEUTRAL_IVS: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

// Common competitive spreads. Each archetype picks one of these.
const SPREAD = {
  fastPhysical: {
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    natureJolly: 'Jolly',
    natureAdamant: 'Adamant',
  },
  fastSpecial: {
    evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    natureTimid: 'Timid',
    natureModest: 'Modest',
  },
  bulkyPhysical: {
    evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
    nature: 'Adamant',
  },
  bulkySpecial: {
    evs: { hp: 252, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 },
    nature: 'Modest',
  },
  physicalWall: {
    evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
    nature: 'Impish',
  },
  specialWall: {
    evs: { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 },
    nature: 'Calm',
  },
} as const;

const SETUP_MOVES_PHYSICAL = new Set([
  'Swords Dance', 'Bulk Up', 'Dragon Dance', 'Coil', 'Hone Claws', 'Curse', 'Belly Drum',
  'No Retreat', 'Shift Gear', 'Howl', 'Meditate', 'Sharpen', 'Tidy Up',
]);
const SETUP_MOVES_SPECIAL = new Set([
  'Nasty Plot', 'Calm Mind', 'Quiver Dance', 'Tail Glow', 'Geomancy', 'Growth',
  'Work Up', 'Charge Beam', 'Take Heart',
]);
const UTILITY_MOVES = new Set([
  'Recover', 'Roost', 'Slack Off', 'Soft-Boiled', 'Synthesis', 'Moonlight', 'Morning Sun',
  'Wish', 'Heal Bell', 'Aromatherapy', 'Defog', 'Rapid Spin', 'Stealth Rock', 'Spikes',
  'Toxic Spikes', 'Sticky Web', 'Thunder Wave', 'Will-O-Wisp', 'Toxic', 'Knock Off',
  'U-turn', 'Volt Switch', 'Flip Turn', 'Parting Shot', 'Teleport', 'Protect',
]);

const SPEED_TIER_FAST = 95; // baseStats.spe >= this -> "fast enough" for offensive Spe spread
const BULK_THRESHOLD = 260; // hp + def + spd >= this -> can run bulky sets

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate up to ~5 archetypal candidate sets. If the species has a custom
 * pool in `ctx.customSetPool`, return that pool verbatim instead.
 */
export function generateCandidateSets(species: Pokemon, ctx: PredictorContext): CandidateSet[] {
  if (ctx.customSetPool && ctx.customSetPool[species.id]) {
    return normalizePrior(ctx.customSetPool[species.id]);
  }

  const physBias = species.baseStats.atk >= species.baseStats.spa;
  const isFast = species.baseStats.spe >= SPEED_TIER_FAST;
  const isBulky = species.baseStats.hp + species.baseStats.def + species.baseStats.spd >= BULK_THRESHOLD;

  const candidates: CandidateSet[] = [];
  const archetypes: Archetype[] = [];

  if (physBias) {
    archetypes.push('physical-sweeper');
    archetypes.push(isFast ? 'physical-scarf' : 'physical-band');
    if (hasAnyMove(species, ctx, SETUP_MOVES_PHYSICAL)) {
      archetypes.push('setup-sweeper-physical');
    }
    if (isBulky) archetypes.push('bulky-physical');
  } else {
    archetypes.push('special-sweeper');
    archetypes.push(isFast ? 'special-scarf' : 'special-specs');
    if (hasAnyMove(species, ctx, SETUP_MOVES_SPECIAL)) {
      archetypes.push('setup-sweeper-special');
    }
    if (isBulky) archetypes.push('bulky-special');
  }

  // Bulky-bias species also get a wall option even if they got a Setup one.
  if (isBulky && candidates.length < 5) {
    archetypes.push(physBias ? 'physical-wall' : 'special-wall');
  }

  // De-dup while preserving order.
  const seen = new Set<Archetype>();
  for (const a of archetypes) {
    if (seen.has(a)) continue;
    seen.add(a);
    const set = buildArchetype(species, a, ctx);
    if (set) candidates.push(set);
  }

  return normalizePrior(candidates);
}

// ---------------------------------------------------------------------------
// Archetype builders
// ---------------------------------------------------------------------------

function buildArchetype(species: Pokemon, archetype: Archetype, ctx: PredictorContext): CandidateSet | null {
  const ability = species.abilities[0] ?? 'No Ability';
  const teraType = species.types[0] ? cap(species.types[0]) : null;
  const allMoves = learnableMoves(species, ctx.moves);
  if (!allMoves.length) return null;

  const physical = isPhysicalArchetype(archetype);
  const offensiveMoves = pickOffensiveMoves(species, ctx, physical, 4);
  const setupMove = pickSetupMove(species, ctx, physical);
  const utility = pickUtilityMove(species, ctx, physical);
  const recovery = pickRecoveryMove(species, ctx);

  const ev = (() => {
    switch (archetype) {
      case 'physical-sweeper':
      case 'physical-scarf':
      case 'physical-band':
      case 'setup-sweeper-physical':
        return SPREAD.fastPhysical.evs;
      case 'special-sweeper':
      case 'special-scarf':
      case 'special-specs':
      case 'setup-sweeper-special':
        return SPREAD.fastSpecial.evs;
      case 'bulky-physical':
        return SPREAD.bulkyPhysical.evs;
      case 'bulky-special':
        return SPREAD.bulkySpecial.evs;
      case 'physical-wall':
        return SPREAD.physicalWall.evs;
      case 'special-wall':
        return SPREAD.specialWall.evs;
    }
  })();

  const nature = (() => {
    switch (archetype) {
      case 'physical-sweeper':
      case 'physical-scarf':
      case 'setup-sweeper-physical':
        return SPREAD.fastPhysical.natureJolly;
      case 'physical-band':
        return SPREAD.fastPhysical.natureAdamant;
      case 'special-sweeper':
      case 'special-scarf':
      case 'setup-sweeper-special':
        return SPREAD.fastSpecial.natureTimid;
      case 'special-specs':
        return SPREAD.fastSpecial.natureModest;
      case 'bulky-physical':
        return SPREAD.bulkyPhysical.nature;
      case 'bulky-special':
        return SPREAD.bulkySpecial.nature;
      case 'physical-wall':
        return SPREAD.physicalWall.nature;
      case 'special-wall':
        return SPREAD.specialWall.nature;
    }
  })();

  const item = (() => {
    switch (archetype) {
      case 'physical-sweeper':
      case 'special-sweeper':
        return 'Life Orb';
      case 'physical-scarf':
      case 'special-scarf':
        return 'Choice Scarf';
      case 'physical-band':
        return 'Choice Band';
      case 'special-specs':
        return 'Choice Specs';
      case 'setup-sweeper-physical':
      case 'setup-sweeper-special':
        return 'Life Orb';
      case 'bulky-physical':
      case 'bulky-special':
        return 'Leftovers';
      case 'physical-wall':
      case 'special-wall':
        return 'Leftovers';
    }
  })();

  const moves: string[] = [];
  const isSetup = archetype === 'setup-sweeper-physical' || archetype === 'setup-sweeper-special';
  const isWall = archetype === 'physical-wall' || archetype === 'special-wall';
  const isChoice = item?.startsWith('Choice');

  if (isSetup && setupMove) moves.push(setupMove);
  if (isWall && recovery) moves.push(recovery);

  for (const m of offensiveMoves) {
    if (moves.includes(m)) continue;
    moves.push(m);
    if (moves.length >= 4) break;
  }

  // Walls and non-choice sets benefit from a utility slot.
  if (!isChoice && moves.length < 4 && utility && !moves.includes(utility)) {
    moves.push(utility);
  }
  // Walls without a recovery move yet - try again from utility pool.
  if (isWall && moves.length < 4) {
    const r = pickRecoveryMove(species, ctx);
    if (r && !moves.includes(r)) moves.push(r);
  }

  while (moves.length < 4) {
    // Top up with the next best offensive option not already in the list.
    const next = offensiveMoves.find((m) => !moves.includes(m));
    if (!next) break;
    moves.push(next);
  }

  return {
    id: `${species.id}:${archetype}`,
    label: archetypeLabel(archetype),
    nature,
    ability,
    item,
    teraType,
    ivs: { ...NEUTRAL_IVS },
    evs: { ...ev },
    moves: moves.slice(0, 4),
    prior: priorForArchetype(archetype),
  };
}

// ---------------------------------------------------------------------------
// Move selection helpers
// ---------------------------------------------------------------------------

function pickOffensiveMoves(
  species: Pokemon,
  ctx: PredictorContext,
  physical: boolean,
  limit: number,
): string[] {
  const all = learnableMoves(species, ctx.moves);
  const wanted = physical ? 'Physical' : 'Special';
  const scored = all
    .filter((m) => m.category === wanted && (m.power || 0) > 0)
    .map((m) => {
      const s = scoreMove(species, m);
      // STAB nudge - already in scoreMove, but bias more for our purposes.
      const stabBonus = species.types.includes(m.type) ? 30 : 0;
      return { m, score: s.score + stabBonus };
    })
    .sort((a, b) => b.score - a.score);

  // Prefer type diversity: cap two moves per type to avoid four-of-a-kind.
  const out: string[] = [];
  const typeCount: Record<string, number> = {};
  for (const { m } of scored) {
    if (out.length >= limit) break;
    const c = typeCount[m.type] ?? 0;
    if (c >= 2) continue;
    out.push(m.name);
    typeCount[m.type] = c + 1;
  }
  return out;
}

function pickSetupMove(species: Pokemon, ctx: PredictorContext, physical: boolean): string | null {
  const pool = physical ? SETUP_MOVES_PHYSICAL : SETUP_MOVES_SPECIAL;
  return findMatch(species, ctx, pool);
}

function pickUtilityMove(species: Pokemon, ctx: PredictorContext, physical: boolean): string | null {
  // Pivot moves preferred; status moves second.
  const preferred = physical
    ? ['U-turn', 'Knock Off', 'Will-O-Wisp', 'Thunder Wave']
    : ['Volt Switch', 'Teleport', 'Thunder Wave', 'Will-O-Wisp'];
  for (const name of preferred) {
    const id = toMoveId(name);
    if (hasLearnableId(species, id)) return ctx.moves[id]?.name ?? name;
  }
  return findMatch(species, ctx, UTILITY_MOVES);
}

function pickRecoveryMove(species: Pokemon, ctx: PredictorContext): string | null {
  return findMatch(
    species,
    ctx,
    new Set(['Recover', 'Roost', 'Slack Off', 'Soft-Boiled', 'Synthesis', 'Moonlight', 'Morning Sun']),
  );
}

function findMatch(species: Pokemon, ctx: PredictorContext, namePool: Set<string>): string | null {
  for (const name of namePool) {
    const id = toMoveId(name);
    if (hasLearnableId(species, id)) return ctx.moves[id]?.name ?? name;
  }
  return null;
}

function hasLearnableId(species: Pokemon, id: string): boolean {
  return species.moves.some((m) => m.move === id);
}

function hasAnyMove(species: Pokemon, ctx: PredictorContext, namePool: Set<string>): boolean {
  for (const name of namePool) {
    if (hasLearnableId(species, toMoveId(name))) return true;
  }
  return false;
}

function toMoveId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function isPhysicalArchetype(a: Archetype): boolean {
  return (
    a === 'physical-sweeper' ||
    a === 'physical-scarf' ||
    a === 'physical-band' ||
    a === 'bulky-physical' ||
    a === 'physical-wall' ||
    a === 'setup-sweeper-physical'
  );
}

function archetypeLabel(a: Archetype): string {
  const map: Record<Archetype, string> = {
    'physical-sweeper': 'Life Orb sweeper (physical)',
    'special-sweeper': 'Life Orb sweeper (special)',
    'physical-scarf': 'Choice Scarf (physical)',
    'special-scarf': 'Choice Scarf (special)',
    'physical-band': 'Choice Band',
    'special-specs': 'Choice Specs',
    'bulky-physical': 'Bulky attacker (physical)',
    'bulky-special': 'Bulky attacker (special)',
    'physical-wall': 'Physical wall',
    'special-wall': 'Special wall',
    'setup-sweeper-physical': 'Setup sweeper (physical)',
    'setup-sweeper-special': 'Setup sweeper (special)',
  };
  return map[a];
}

function priorForArchetype(a: Archetype): number {
  // Coarse weighting reflecting metagame prevalence - pure offensive sets are
  // most common, choice items next, walls less common in casual settings.
  const priors: Record<Archetype, number> = {
    'physical-sweeper': 1.0,
    'special-sweeper': 1.0,
    'physical-scarf': 0.8,
    'special-scarf': 0.8,
    'physical-band': 0.8,
    'special-specs': 0.8,
    'setup-sweeper-physical': 0.6,
    'setup-sweeper-special': 0.6,
    'bulky-physical': 0.5,
    'bulky-special': 0.5,
    'physical-wall': 0.4,
    'special-wall': 0.4,
  };
  return priors[a];
}

function normalizePrior(sets: CandidateSet[]): CandidateSet[] {
  const sum = sets.reduce((a, s) => a + s.prior, 0);
  if (sum <= 0) return sets;
  return sets.map((s) => ({ ...s, prior: s.prior / sum }));
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// Re-export the test helper for unit tests that need to peek.
export const __test_only__ = { isPhysicalArchetype, priorForArchetype, normalizePrior };

// Need this helper exported so tests can reference Move (silences unused-import).
export type { Move };
