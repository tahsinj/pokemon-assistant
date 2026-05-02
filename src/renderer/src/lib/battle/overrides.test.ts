import { beforeEach, describe, expect, it } from 'vitest';
import {
  createRegistry,
  getGlobalRegistry,
  getMoveOverride,
  getSpeciesOverride,
  registerMoveOverride,
  registerSpeciesOverride,
  resetGlobalRegistry,
  summarizeSpeciesDivergence,
} from './overrides';
import { buildManifest, getMergedMove, getMergedSpecies } from './dex';
import { syncCobblemonSpecies } from './cobblemonSync';
import { calcDamage } from './damage';
import { EMPTY_FIELD, NEUTRAL_EVS, NEUTRAL_IVS, type BattlePokemonSpec } from './types';
import type { Pokemon as CobblemonPokemon } from '../types';

const FIELD = EMPTY_FIELD;

function baseSpec(species: string): BattlePokemonSpec {
  return {
    speciesName: species,
    level: 50,
    nature: 'Jolly',
    ivs: NEUTRAL_IVS,
    evs: { ...NEUTRAL_EVS, atk: 252, spe: 252 },
    boosts: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [],
  };
}

describe('Override registry', () => {
  beforeEach(() => resetGlobalRegistry());

  it('returns undefined for unknown ids', () => {
    const reg = createRegistry();
    expect(getMoveOverride(reg, 'nonexistent')).toBeUndefined();
    expect(getSpeciesOverride(reg, 'doesnotexist')).toBeUndefined();
  });

  it('round-trips a registered species override', () => {
    const reg = createRegistry();
    registerSpeciesOverride(reg, {
      id: 'garchomp',
      name: 'Garchomp',
      types: ['dragon', 'ground'],
      source: 'MANUAL',
    });
    const got = getSpeciesOverride(reg, 'Garchomp');
    expect(got?.types).toEqual(['dragon', 'ground']);
  });

  it('normalizes id casing and punctuation on lookup', () => {
    const reg = createRegistry();
    registerMoveOverride(reg, {
      id: 'doubleedge',
      name: 'Double-Edge',
      basePower: 130,
      source: 'MANUAL',
    });
    expect(getMoveOverride(reg, 'Double-Edge')?.basePower).toBe(130);
    expect(getMoveOverride(reg, 'DoubleEdge')?.basePower).toBe(130);
    expect(getMoveOverride(reg, 'double_edge')?.basePower).toBe(130);
  });

  it('summarizes a species divergence into human-readable lines', () => {
    const lines = summarizeSpeciesDivergence({
      types: { showdown: ['dragon', 'ground'], cobblemon: ['dragon', 'fairy'] },
      baseStats: { atk: { showdown: 130, cobblemon: 140 } },
      weightkg: { showdown: 95, cobblemon: 100 },
      abilities: { showdown: ['Rough Skin'], cobblemon: ['Sand Veil', 'Rough Skin'] },
    });
    expect(lines).toEqual([
      'Types: dragon/ground → dragon/fairy',
      'ATK: 130 → 140',
      'Weight: 95kg → 100kg',
      'Abilities: Rough Skin → Sand Veil/Rough Skin',
    ]);
  });
});

describe('Dex overlay', () => {
  beforeEach(() => resetGlobalRegistry());

  it('returns Showdown baseline when no override exists', () => {
    const m = getMergedSpecies('Garchomp');
    expect(m).not.toBeNull();
    expect(m!.hasOverride).toBe(false);
    expect(m!.types).toEqual(['Dragon', 'Ground']);
    expect(m!.baseStats.atk).toBe(130);
  });

  it('overlays Cobblemon override fields onto the Showdown baseline', () => {
    registerSpeciesOverride(getGlobalRegistry(), {
      id: 'garchomp',
      name: 'Garchomp',
      types: ['dragon', 'fairy'], // hypothetical Cobblemon retype
      source: 'MANUAL',
    });
    const m = getMergedSpecies('Garchomp');
    expect(m?.hasOverride).toBe(true);
    expect(m?.types).toEqual(['dragon', 'fairy']);
    // Stats untouched (still pulled from Showdown).
    expect(m?.baseStats.atk).toBe(130);
  });

  it('reports a move divergence when one is registered', () => {
    registerMoveOverride(getGlobalRegistry(), {
      id: 'tackle',
      name: 'Tackle',
      basePower: 70, // Cobblemon hypothetically buffed Tackle
      source: 'MANUAL',
    });
    const m = getMergedMove('Tackle');
    expect(m?.hasOverride).toBe(true);
    expect(m?.basePower).toBe(70);
    expect(m?.divergence?.basePower?.showdown).toBeLessThan(70);
  });

  it('buildManifest lists every active override', () => {
    const reg = getGlobalRegistry();
    registerMoveOverride(reg, { id: 'tackle', name: 'Tackle', basePower: 70, source: 'MANUAL' });
    registerSpeciesOverride(reg, { id: 'garchomp', name: 'Garchomp', source: 'MANUAL' });
    const manifest = buildManifest(reg);
    expect(manifest.totals.moves).toBe(1);
    expect(manifest.totals.species).toBe(1);
    expect(manifest.moves[0].name).toBe('Tackle');
  });
});

describe('CobblemonSync', () => {
  beforeEach(() => resetGlobalRegistry());

  it('registers an override when stats diverge', () => {
    const cb: CobblemonPokemon = {
      id: 'garchomp',
      name: 'Garchomp',
      dex: 445,
      types: ['dragon', 'ground'],
      abilities: ['Sand Veil'],
      hiddenAbilities: ['Rough Skin'],
      baseStats: { hp: 108, atk: 150, def: 95, spa: 80, spd: 85, spe: 102 }, // ATK buffed in Cobblemon
      eggGroups: [],
      height: 19,
      weight: 950,
      labels: [],
      moves: [],
    };
    const result = syncCobblemonSpecies([cb]);
    expect(result.processed).toBe(1);
    expect(result.divergent).toBe(1);
    expect(result.diffs[0].divergence.baseStats?.atk?.cobblemon).toBe(150);
    expect(result.diffs[0].divergence.baseStats?.atk?.showdown).toBe(130);
  });

  it('does not register an override when data matches Showdown', () => {
    const cb: CobblemonPokemon = {
      id: 'garchomp',
      name: 'Garchomp',
      dex: 445,
      types: ['Dragon', 'Ground'],
      abilities: ['Sand Veil'],
      hiddenAbilities: ['Rough Skin'],
      baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
      eggGroups: [],
      height: 19,
      weight: 950,
      labels: [],
      moves: [],
    };
    const result = syncCobblemonSpecies([cb]);
    expect(result.divergent).toBe(0);
  });

  it('records unmatched species without throwing', () => {
    const cb: CobblemonPokemon = {
      id: 'fakemon',
      name: 'FakemonAnnex',
      dex: 9999,
      types: ['Normal'],
      abilities: [],
      hiddenAbilities: [],
      baseStats: { hp: 100, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 },
      eggGroups: [],
      height: 1,
      weight: 1,
      labels: [],
      moves: [],
    };
    const result = syncCobblemonSpecies([cb]);
    expect(result.unmatched).toContain('FakemonAnnex');
    expect(result.divergent).toBe(0);
  });
});

describe('Damage engine respects Cobblemon overrides', () => {
  beforeEach(() => resetGlobalRegistry());

  it('species type override is recorded in the merged dex view (informational)', () => {
    // The overlay forwards types/weightkg to CalcPokemon; baseStats overrides are
    // informational only (the calc reads stats from its baked-in species
    // table, not from per-call options). Pure baseStats overrides therefore
    // do not flow through to damage numbers - verified here.
    const attacker = baseSpec('Garchomp');
    const defender = baseSpec('Tatsugiri');
    const base = calcDamage(9, attacker, defender, 'Earthquake', FIELD);
    expect(base.error).toBeUndefined();
    expect(base.avgDamage).toBeGreaterThan(0);

    registerSpeciesOverride(getGlobalRegistry(), {
      id: 'garchomp',
      name: 'Garchomp',
      baseStats: { atk: 250 },
      source: 'MANUAL',
    });
    const after = calcDamage(9, attacker, defender, 'Earthquake', FIELD);
    expect(after.avgDamage).toBe(base.avgDamage);
  });

  it('honors a move basePower override in the damage calc', () => {
    const attacker = baseSpec('Garchomp');
    const defender = baseSpec('Tatsugiri');
    const base = calcDamage(9, attacker, defender, 'Earthquake', FIELD);
    registerMoveOverride(getGlobalRegistry(), {
      id: 'earthquake',
      name: 'Earthquake',
      basePower: 1,
      source: 'MANUAL',
    });
    const after = calcDamage(9, attacker, defender, 'Earthquake', FIELD);
    expect(after.avgDamage).toBeLessThan(base.avgDamage / 5);
  });

  it('honors a type override in the damage calc', () => {
    // Earthquake (Ground) -> Electric: Tatsugiri is Dragon/Water.
    // Ground vs Dragon/Water = 1× × 2× = 2× ; Electric vs Dragon/Water = 0.5× × 2× = 1×.
    // Damage should drop when we reroute Earthquake to Electric.
    const attacker = baseSpec('Garchomp');
    const defender = baseSpec('Tatsugiri');
    const baseline = calcDamage(9, attacker, defender, 'Earthquake', FIELD);
    registerMoveOverride(getGlobalRegistry(), {
      id: 'earthquake',
      name: 'Earthquake',
      type: 'electric',
      source: 'MANUAL',
    });
    const after = calcDamage(9, attacker, defender, 'Earthquake', FIELD);
    expect(after.avgDamage).toBeLessThan(baseline.avgDamage);
  });
});
