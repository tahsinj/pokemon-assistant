/**
 * Golden calcs: 30 varied cases through our wrapper with id-form inputs
 * ("choiceband", "hugepower", "earthquake") must give exactly the rolls
 * @smogon/calc gives when called directly with display names.
 */
import { describe, expect, it } from 'vitest';
import { calculate, Field, Generations, Move, Pokemon } from '@smogon/calc';
import { calcDamage } from './damage';
import { EMPTY_FIELD, EMPTY_SIDE, NEUTRAL_IVS, type BattlePokemonSpec, type FieldSpec } from './types';

interface Mon {
  species: string;
  item?: string;
  ability?: string;
  nature?: string;
  evs?: Partial<BattlePokemonSpec['evs']>;
  boosts?: BattlePokemonSpec['boosts'];
  status?: BattlePokemonSpec['status'];
  tera?: string;
}

interface Case {
  atk: Mon;
  def: Mon;
  move: string;
  crit?: boolean;
  field?: Partial<FieldSpec>;
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const PHYS = { atk: 252, spe: 252, hp: 4 };
const SPEC = { spa: 252, spe: 252, hp: 4 };
const BULK = { hp: 252, def: 252, spd: 4 };
const SBULK = { hp: 252, spd: 252, def: 4 };

const CASES: Case[] = [
  { atk: { species: 'Garchomp', item: 'Choice Band', ability: 'Rough Skin', nature: 'Jolly', evs: PHYS }, def: { species: 'Toxapex', item: 'Black Sludge', ability: 'Regenerator', nature: 'Impish', evs: BULK }, move: 'Earthquake' },
  { atk: { species: 'Garchomp', item: 'Life Orb', ability: 'Rough Skin', nature: 'Adamant', evs: PHYS }, def: { species: 'Gholdengo', ability: 'Good as Gold', nature: 'Timid', evs: SPEC }, move: 'Earthquake' },
  { atk: { species: 'Azumarill', item: 'Choice Band', ability: 'Huge Power', nature: 'Adamant', evs: PHYS }, def: { species: 'Garchomp', ability: 'Rough Skin', nature: 'Jolly', evs: PHYS }, move: 'Play Rough' },
  { atk: { species: 'Dragonite', item: 'Choice Band', ability: 'Multiscale', nature: 'Adamant', evs: PHYS }, def: { species: 'Blissey', item: 'Heavy-Duty Boots', ability: 'Natural Cure', nature: 'Bold', evs: BULK }, move: 'Extreme Speed' },
  { atk: { species: 'Kingambit', item: 'Black Glasses', ability: 'Supreme Overlord', nature: 'Adamant', evs: PHYS }, def: { species: 'Great Tusk', ability: 'Protosynthesis', nature: 'Jolly', evs: PHYS }, move: 'Kowtow Cleave' },
  { atk: { species: 'Gholdengo', item: 'Choice Specs', ability: 'Good as Gold', nature: 'Timid', evs: SPEC }, def: { species: 'Kingambit', ability: 'Supreme Overlord', nature: 'Adamant', evs: PHYS }, move: 'Make It Rain' },
  { atk: { species: 'Volcarona', item: 'Heavy-Duty Boots', ability: 'Flame Body', nature: 'Timid', evs: SPEC, boosts: { spa: 1, spd: 1, spe: 1 } }, def: { species: 'Toxapex', item: 'Black Sludge', ability: 'Regenerator', nature: 'Bold', evs: BULK }, move: 'Fiery Dance' },
  { atk: { species: 'Iron Valiant', item: 'Booster Energy', ability: 'Quark Drive', nature: 'Naive', evs: SPEC }, def: { species: 'Dragonite', item: 'Heavy-Duty Boots', ability: 'Multiscale', nature: 'Adamant', evs: PHYS }, move: 'Moonblast' },
  { atk: { species: 'Cinderace', item: 'Heavy-Duty Boots', ability: 'Libero', nature: 'Jolly', evs: PHYS }, def: { species: 'Corviknight', ability: 'Pressure', nature: 'Impish', evs: BULK }, move: 'Pyro Ball' },
  { atk: { species: 'Barraskewda', item: 'Choice Band', ability: 'Swift Swim', nature: 'Adamant', evs: PHYS }, def: { species: 'Garchomp', ability: 'Rough Skin', nature: 'Jolly', evs: PHYS }, move: 'Liquidation', field: { weather: 'Rain' } },
  { atk: { species: 'Torkoal', item: 'Choice Specs', ability: 'Drought', nature: 'Modest', evs: SPEC }, def: { species: 'Ferrothorn', item: 'Leftovers', ability: 'Iron Barbs', nature: 'Relaxed', evs: BULK }, move: 'Eruption', field: { weather: 'Sun' } },
  { atk: { species: 'Tyranitar', item: 'Choice Band', ability: 'Sand Stream', nature: 'Adamant', evs: PHYS }, def: { species: 'Latios', ability: 'Levitate', nature: 'Timid', evs: SPEC }, move: 'Crunch', field: { weather: 'Sand' } },
  { atk: { species: 'Rillaboom', item: 'Choice Band', ability: 'Grassy Surge', nature: 'Adamant', evs: PHYS }, def: { species: 'Toxapex', ability: 'Regenerator', nature: 'Bold', evs: BULK }, move: 'Grassy Glide', field: { terrain: 'Grassy' } },
  { atk: { species: 'Tapu Koko', item: 'Life Orb', ability: 'Electric Surge', nature: 'Timid', evs: SPEC }, def: { species: 'Corviknight', ability: 'Pressure', nature: 'Impish', evs: BULK }, move: 'Thunderbolt', field: { terrain: 'Electric' } },
  { atk: { species: 'Scizor', item: 'Choice Band', ability: 'Technician', nature: 'Adamant', evs: PHYS }, def: { species: 'Latias', ability: 'Levitate', nature: 'Timid', evs: SPEC }, move: 'Bullet Punch' },
  { atk: { species: 'Breloom', item: 'King\'s Rock', ability: 'Technician', nature: 'Jolly', evs: PHYS }, def: { species: 'Rotom-Wash', ability: 'Levitate', nature: 'Bold', evs: BULK }, move: 'Bullet Seed' },
  { atk: { species: 'Maushold', item: 'Wide Lens', ability: 'Technician', nature: 'Jolly', evs: PHYS }, def: { species: 'Clefable', ability: 'Magic Guard', nature: 'Bold', evs: BULK }, move: 'Population Bomb' },
  { atk: { species: 'Blissey', ability: 'Natural Cure', nature: 'Bold', evs: BULK }, def: { species: 'Garchomp', ability: 'Rough Skin', nature: 'Jolly', evs: PHYS }, move: 'Seismic Toss' },
  { atk: { species: 'Marowak-Alola', item: 'Thick Club', ability: 'Lightning Rod', nature: 'Adamant', evs: PHYS }, def: { species: 'Skarmory', ability: 'Sturdy', nature: 'Impish', evs: BULK }, move: 'Flare Blitz' },
  { atk: { species: 'Dragapult', item: 'Choice Specs', ability: 'Infiltrator', nature: 'Timid', evs: SPEC }, def: { species: 'Gengar', ability: 'Cursed Body', nature: 'Timid', evs: SPEC }, move: 'Shadow Ball', crit: true },
  { atk: { species: 'Great Tusk', ability: 'Protosynthesis', nature: 'Jolly', evs: PHYS, status: 'brn' }, def: { species: 'Gholdengo', ability: 'Good as Gold', nature: 'Timid', evs: SPEC }, move: 'Headlong Rush' },
  { atk: { species: 'Garchomp', ability: 'Rough Skin', nature: 'Jolly', evs: PHYS, boosts: { atk: 2 } }, def: { species: 'Clefable', item: 'Leftovers', ability: 'Unaware', nature: 'Bold', evs: BULK }, move: 'Iron Head' },
  { atk: { species: 'Gholdengo', ability: 'Good as Gold', nature: 'Timid', evs: SPEC }, def: { species: 'Snorlax', item: 'Leftovers', ability: 'Thick Fat', nature: 'Careful', evs: SBULK }, move: 'Focus Blast' },
  { atk: { species: 'Heatran', item: 'Choice Specs', ability: 'Flash Fire', nature: 'Modest', evs: SPEC }, def: { species: 'Mamoswine', ability: 'Thick Fat', nature: 'Jolly', evs: PHYS }, move: 'Flamethrower' },
  { atk: { species: 'Dragonite', ability: 'Multiscale', nature: 'Adamant', evs: PHYS, tera: 'Normal' }, def: { species: 'Kingambit', ability: 'Supreme Overlord', nature: 'Adamant', evs: PHYS }, move: 'Extreme Speed' },
  { atk: { species: 'Garchomp', item: 'Expert Belt', ability: 'Rough Skin', nature: 'Jolly', evs: PHYS }, def: { species: 'Heatran', item: 'Leftovers', ability: 'Flash Fire', nature: 'Calm', evs: SBULK }, move: 'Earthquake' },
  { atk: { species: 'Kartana', item: 'Choice Scarf', ability: 'Beast Boost', nature: 'Jolly', evs: PHYS }, def: { species: 'Hippowdon', item: 'Leftovers', ability: 'Sand Stream', nature: 'Impish', evs: BULK }, move: 'Leaf Blade', field: { defenderSide: { ...EMPTY_SIDE, isReflect: true } } },
  { atk: { species: 'Latios', item: 'Soul Dew', ability: 'Levitate', nature: 'Timid', evs: SPEC }, def: { species: 'Tyranitar', ability: 'Sand Stream', nature: 'Careful', evs: SBULK }, move: 'Draco Meteor', field: { defenderSide: { ...EMPTY_SIDE, isLightScreen: true } } },
  { atk: { species: 'Weavile', item: 'Choice Band', ability: 'Pressure', nature: 'Jolly', evs: PHYS }, def: { species: 'Landorus-Therian', item: 'Rocky Helmet', ability: 'Intimidate', nature: 'Impish', evs: BULK, boosts: { def: 1 } }, move: 'Triple Axel' },
  { atk: { species: 'Urshifu-Rapid-Strike', item: 'Choice Band', ability: 'Unseen Fist', nature: 'Jolly', evs: PHYS }, def: { species: 'Toxapex', ability: 'Regenerator', nature: 'Bold', evs: BULK }, move: 'Surging Strikes' },
];

function direct(c: Case): number[] {
  const gen = Generations.get(9);
  const mon = (m: Mon) =>
    new Pokemon(gen, m.species, {
      item: m.item as never,
      ability: m.ability as never,
      nature: (m.nature ?? 'Hardy') as never,
      evs: { ...EVS, ...m.evs },
      ivs: NEUTRAL_IVS,
      boosts: m.boosts,
      status: m.status as never,
      teraType: m.tera as never,
    });
  const f = { ...EMPTY_FIELD, ...c.field };
  const side = (s: typeof EMPTY_SIDE) => ({ isReflect: s.isReflect, isLightScreen: s.isLightScreen });
  const field = new Field({
    weather: (f.weather || undefined) as never,
    terrain: (f.terrain || undefined) as never,
    attackerSide: side(f.attackerSide),
    defenderSide: side(f.defenderSide),
  });
  const result = calculate(gen, mon(c.atk), mon(c.def), new Move(gen, c.move, { isCrit: c.crit }), field);
  const d = result.damage;
  if (typeof d === 'number') return d > 0 ? [d] : [];
  if (Array.isArray(d[0])) {
    const hits = d as number[][];
    return hits[0].map((_, i) => hits.reduce((sum, h) => sum + h[i], 0));
  }
  return d as number[];
}

function viaWrapper(c: Case): number[] {
  const spec = (m: Mon): BattlePokemonSpec => ({
    speciesName: toId(m.species),
    level: 100,
    nature: m.nature ?? 'Hardy',
    ability: m.ability ? toId(m.ability) : undefined,
    item: m.item ? toId(m.item) : undefined,
    teraType: m.tera,
    isTerastallized: !!m.tera,
    ivs: { ...NEUTRAL_IVS },
    evs: { ...EVS, ...m.evs },
    moves: [],
    boosts: m.boosts,
    status: m.status,
  });
  return calcDamage(9, spec(c.atk), spec(c.def), toId(c.move), { ...EMPTY_FIELD, ...c.field }, { isCrit: c.crit }).rolls;
}

describe('calc wrapper golden cases', () => {
  it('has 30 cases', () => expect(CASES).toHaveLength(30));
  CASES.forEach((c, i) => {
    it(`${i + 1}: ${c.atk.species} ${c.move} vs ${c.def.species}`, () => {
      const expected = direct(c);
      expect(expected.length).toBeGreaterThan(0);
      expect(viaWrapper(c)).toEqual(expected);
    });
  });
});
