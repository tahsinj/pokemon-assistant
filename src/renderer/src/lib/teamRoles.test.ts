import { describe, it, expect } from 'vitest';
import { classifyMember } from './teamRoles';
import type { Move, Pokemon, BaseStats } from './types';
import type { MemberDetail } from './bridgeTypes';
import type { SmogonSpeciesIntel } from './smogon';

const mv = (
  name: string,
  category: Move['category'],
  over: Partial<Move> = {},
): Move =>
  ({
    id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    name,
    type: 'Normal',
    category,
    power: 0,
    accuracy: 100,
    pp: 10,
    priority: 0,
    desc: '',
    target: 'normal',
    flags: [],
    ...over,
  }) as Move;

const moves: Record<string, Move> = Object.fromEntries(
  [
    mv('Stealth Rock', 'Status', { target: 'foeSide' }),
    mv('Defog', 'Status'),
    mv('Rapid Spin', 'Physical', { power: 50, flags: ['contact'] }),
    mv('Swords Dance', 'Status', { flags: ['dance'] }),
    mv('Nasty Plot', 'Status'),
    mv('Roost', 'Status', { flags: ['heal'] }),
    mv('Recover', 'Status', { flags: ['heal'] }),
    mv('U-turn', 'Physical', { power: 70 }),
    mv('Volt Switch', 'Special', { power: 70 }),
    mv('Court Change', 'Status'),
    mv('Mortal Spin', 'Physical', { power: 30 }),
    mv('Sticky Web', 'Status', { target: 'foeSide' }),
    mv('Extreme Speed', 'Physical', { power: 80, priority: 2 }),
    mv('Close Combat', 'Physical', { power: 120 }),
    mv('Earthquake', 'Physical', { power: 100 }),
    mv('Scald', 'Special', { power: 80 }),
    mv('Flamethrower', 'Special', { power: 90 }),
  ].map((m) => [m.id, m]),
);

const BALANCED: BaseStats = { hp: 80, atk: 100, def: 80, spa: 80, spd: 80, spe: 90 };
const mon = (id: string, over: Partial<Pokemon> = {}): Pokemon =>
  ({
    id,
    name: id,
    dex: 1,
    types: ['Normal'],
    abilities: ['Pressure'],
    hiddenAbilities: [],
    baseStats: { ...BALANCED },
    eggGroups: [],
    moves: [],
    ...over,
  }) as Pokemon;

const detail = (over: Partial<MemberDetail> = {}): MemberDetail => ({
  item: null, ability: null, nature: null, level: null, ivs: null, evs: null, moves: null, ...over,
});

const intel = (over: Partial<SmogonSpeciesIntel> = {}): SmogonSpeciesIntel =>
  ({
    name: 'x', usage: 0, rank: 0, abilities: [], items: [], spreads: [], moves: [],
    teraTypes: [], teammates: [], checks: [], ...over,
  }) as SmogonSpeciesIntel;

describe('classifyMember', () => {
  it('tags a Stealth Rock user as hazard-setter (moveSource detail)', () => {
    const m = classifyMember(
      mon('lando', { baseStats: { hp: 89, atk: 145, def: 90, spa: 105, spd: 80, spe: 91 } }),
      detail({ moves: ['Stealth Rock', 'Earthquake'] }),
      null,
      moves,
    );
    expect(m.moveSource).toBe('detail');
    expect(m.tags).toContain('hazard-setter');
    expect(m.tags).toContain('physical-attacker');
  });

  it('tags a Swords Dance physical mon as setup-sweeper + physical-attacker', () => {
    const m = classifyMember(
      mon('chomp', { baseStats: { hp: 108, atk: 130, def: 95, spa: 60, spd: 85, spe: 102 } }),
      detail({ moves: ['Swords Dance', 'Close Combat', 'Earthquake'] }),
      null,
      moves,
    );
    expect(m.tags).toContain('setup-sweeper');
    expect(m.tags).toContain('physical-attacker');
    expect(m.tags).not.toContain('special-attacker');
  });

  it('tags a bulky Roost user as a wall', () => {
    const m = classifyMember(
      mon('toed', { baseStats: { hp: 100, atk: 70, def: 120, spa: 60, spd: 100, spe: 50 } }),
      detail({ moves: ['Roost', 'Scald'] }),
      null,
      moves,
    );
    expect(m.tags).toContain('wall');
  });

  it('tags a Regenerator mon as pivot via the ability (no pivot move)', () => {
    const m = classifyMember(
      mon('pex', { abilities: ['Regenerator'], baseStats: { hp: 50, atk: 63, def: 152, spa: 53, spd: 142, spe: 35 } }),
      detail({ moves: ['Scald', 'Recover'] }),
      null,
      moves,
    );
    expect(m.tags).toContain('pivot');
  });

  it('tags an Extreme Speed user as revenge-killer via priority even when slow', () => {
    const m = classifyMember(
      mon('dragonite', { baseStats: { hp: 91, atk: 134, def: 95, spa: 100, spd: 100, spe: 30 } }),
      detail({ moves: ['Extreme Speed', 'Close Combat'] }),
      null,
      moves,
    );
    expect(m.tags).toContain('revenge-killer');
  });

  it('falls back to top Smogon moves when the slot has no set', () => {
    const p = mon('lando2', {
      moves: [{ move: 'stealthrock', learn: 'tm' }, { move: 'earthquake', learn: 'tm' }],
      baseStats: { hp: 89, atk: 145, def: 90, spa: 105, spd: 80, spe: 91 },
    });
    const m = classifyMember(p, null, intel({ moves: [{ name: 'Stealth Rock', pct: 90 }, { name: 'Earthquake', pct: 80 }] }), moves);
    expect(m.moveSource).toBe('smogon');
    expect(m.tags).toContain('hazard-setter');
  });

  it('falls back to a learnset set when there is no detail and no intel', () => {
    const p = mon('blaze', {
      moves: [{ move: 'closecombat', learn: 'tm' }, { move: 'flamethrower', learn: 'tm' }, { move: 'earthquake', learn: 'tm' }],
    });
    const m = classifyMember(p, null, null, moves);
    expect(m.moveSource).toBe('learnset');
  });

  it('tags Court Change and Mortal Spin users as hazard-control', () => {
    const court = classifyMember(mon('cinderace'), detail({ moves: ['Court Change', 'Close Combat'] }), null, moves);
    expect(court.tags).toContain('hazard-control');
    const spin = classifyMember(mon('forretress'), detail({ moves: ['Mortal Spin', 'Earthquake'] }), null, moves);
    expect(spin.tags).toContain('hazard-control');
  });

  it('tags a Sticky Web user as both hazard-setter and speed-control', () => {
    const m = classifyMember(mon('ribombee'), detail({ moves: ['Sticky Web', 'Scald'] }), null, moves);
    expect(m.tags).toContain('hazard-setter');
    expect(m.tags).toContain('speed-control');
  });

  it('lets an aggressive EV spread override a bulky base-stat shape', () => {
    // Armarouge-shaped: base stats read bulky, but 252 SpA / 252 Spe is offense.
    const armarouge = mon('armarouge', { baseStats: { hp: 85, atk: 60, def: 100, spa: 125, spd: 80, spe: 75 } });
    const aggro = classifyMember(
      armarouge,
      detail({ moves: ['Flamethrower', 'Roost'], evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 4, spe: 252 } }),
      null,
      moves,
    );
    expect(aggro.tags).not.toContain('wall');
    expect(aggro.tags).toContain('special-attacker');
    // Same mon, no investment -> falls back to base-stat bulk and can wall.
    const passive = classifyMember(armarouge, detail({ moves: ['Flamethrower', 'Roost'] }), null, moves);
    expect(passive.tags).toContain('wall');
  });

  it('does not call a frail fast attacker a wall even with recovery', () => {
    const m = classifyMember(
      mon('frail', { baseStats: { hp: 70, atk: 130, def: 60, spa: 60, spd: 60, spe: 120 } }),
      detail({ moves: ['Roost', 'Close Combat'] }),
      null,
      moves,
    );
    expect(m.tags).not.toContain('wall');
  });
});
