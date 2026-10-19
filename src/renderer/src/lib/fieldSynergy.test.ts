import { describe, expect, it } from 'vitest';
import { battleAbility, fieldSynergy, fieldTraits } from './fieldSynergy';
import type { Pokemon } from './types';

const mon = (id: string, types: string[], over: Partial<Pokemon> = {}): Pokemon =>
  ({
    id,
    name: id,
    dex: 1,
    types,
    abilities: [],
    hiddenAbilities: [],
    baseStats: { hp: 80, atk: 90, def: 80, spa: 90, spd: 80, spe: 80 },
    eggGroups: [],
    height: 10,
    weight: 100,
    labels: [],
    moves: [],
    ...over,
  }) as Pokemon;

const attacker = { attacker: true, sweeper: false };
const traits = (p: Pokemon, ability: string, moves: string[] = [], opts = attacker, item: string | null = null) =>
  fieldTraits(p, ability, item, moves, opts);

const charizardY = traits(mon('Charizard-Mega-Y', ['fire', 'flying']), 'drought', ['solarbeam']);
const pelipper = traits(mon('Pelipper', ['water', 'flying']), 'drizzle', ['hurricane']);
const venusaur = traits(mon('Venusaur', ['grass', 'poison']), 'chlorophyll', ['growth', 'weatherball']);
const kingdra = traits(mon('Kingdra', ['water', 'dragon']), 'swiftswim', ['raindance']);
const filler = traits(mon('Filler', ['normal']), 'intimidate', [], { attacker: false, sweeper: false });

describe('fieldSynergy', () => {
  it('rewards a setter with the teammates that use its weather', () => {
    const sun = fieldSynergy([charizardY, venusaur, filler]);
    const none = fieldSynergy([charizardY, filler, filler]);
    expect(sun.score).toBeGreaterThan(none.score + 0.5);
    expect(sun.notes).toContain('Sun: Charizard-Mega-Y sets it for Venusaur');
  });

  it('penalizes two automatic weathers on one team', () => {
    const out = fieldSynergy([charizardY, pelipper, filler]);
    expect(out.score).toBeLessThan(0);
    expect(out.notes.some((n) => n.startsWith('Clash: Sun and Rain'))).toBe(true);
  });

  it('penalizes a weather abuser whose weather no teammate sets', () => {
    const out = fieldSynergy([pelipper, venusaur]);
    expect(out.notes).toContain('Venusaur: needs Sun, which no teammate sets');
    expect(fieldSynergy([pelipper, kingdra]).score).toBeGreaterThan(out.score);
  });

  it('counts water attackers against sun and fire attackers against rain', () => {
    const water = traits(mon('Water', ['water']), 'torrent');
    const fire = traits(mon('Fire', ['fire']), 'blaze');
    expect(fieldSynergy([charizardY, water]).score).toBeLessThan(0);
    expect(fieldSynergy([pelipper, fire]).score).toBeLessThan(0);
  });

  it('needs snow for Aurora Veil unless the user sets it', () => {
    const veil = traits(mon('Veiler', ['ice']), 'pressure', ['auroraveil']);
    expect(fieldSynergy([veil]).notes).toContain('Veiler: Aurora Veil fails without snow');
    const ninetales = traits(mon('Ninetales-Alola', ['ice', 'fairy']), 'snowwarning', ['auroraveil']);
    expect(fieldSynergy([ninetales]).notes).toEqual([]);
  });

  it('rewards screens with setup sweepers behind them', () => {
    const screens = traits(mon('Setter', ['psychic']), 'pressure', ['reflect', 'lightscreen'], { attacker: false, sweeper: false });
    const sweeper = traits(mon('Sweeper', ['dragon']), 'pressure', ['dragondance'], { attacker: true, sweeper: true });
    const out = fieldSynergy([screens, sweeper]);
    expect(out.score).toBeGreaterThan(0);
    expect(out.notes).toContain('Screens: Setter sets them up for Sweeper');
  });

  it('pairs Trick Room with slow, strong attackers', () => {
    const setter = traits(mon('Setter', ['psychic']), 'pressure', ['trickroom'], { attacker: false, sweeper: false });
    const slow = traits(mon('Slow', ['steel'], { baseStats: { hp: 100, atk: 130, def: 100, spa: 50, spd: 80, spe: 30 } }), 'pressure');
    expect(fieldSynergy([setter, slow]).notes).toContain('Trick Room: Setter sets it for Slow');
  });

  it('treats Booster Energy as covering Protosynthesis', () => {
    const booster = traits(mon('Paradox', ['ground']), 'protosynthesis', [], attacker, 'Booster Energy');
    const plain = traits(mon('Paradox', ['ground']), 'protosynthesis');
    expect(booster.uses.sun).toBeLessThan(plain.uses.sun ?? 0);
    expect(booster.needs).toEqual([]);
  });
});

describe('battleAbility', () => {
  const charizard = mon('charizard', ['fire', 'flying'], { abilities: ['blaze'] });
  const megaY = mon('charizardmegay', ['fire', 'flying'], { abilities: ['drought'], forme: 'Mega-Y' });
  const megaX = mon('charizardmegax', ['fire', 'dragon'], { abilities: ['toughclaws'], forme: 'Mega-X' });
  const byId = { charizard, charizardmegay: megaY, charizardmegax: megaX };

  it('uses the Mega forme ability for a held Mega Stone', () => {
    expect(battleAbility(charizard, 'Blaze', 'Charizardite Y', byId)).toBe('drought');
    expect(battleAbility(charizard, 'Blaze', 'Charizardite X', byId)).toBe('toughclaws');
  });

  it('uses a Mega species own ability and the set ability otherwise', () => {
    expect(battleAbility(megaY, 'Blaze', null, byId)).toBe('drought');
    expect(battleAbility(charizard, 'Solar Power', 'Heavy-Duty Boots', byId)).toBe('solarpower');
    expect(battleAbility(charizard, 'Blaze', 'Eviolite', byId)).toBe('blaze');
  });
});
