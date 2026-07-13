import { describe, it, expect } from 'vitest';
import { auditTeam, suggestForGap, type CompositionGap, type Severity } from './teamComposition';
import type { RoleSlotInput } from './teamRoles';
import type { Move, Pokemon, BaseStats } from './types';
import type { MemberDetail } from './bridgeTypes';

const mv = (name: string, category: Move['category'], over: Partial<Move> = {}): Move =>
  ({
    id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
    name, type: 'Normal', category, power: 0, accuracy: 100, pp: 10, priority: 0,
    desc: '', target: 'normal', flags: [], ...over,
  }) as Move;

const moves: Record<string, Move> = Object.fromEntries(
  [
    mv('Stealth Rock', 'Status', { target: 'foeSide' }),
    mv('Swords Dance', 'Status'),
    mv('Close Combat', 'Physical', { power: 120 }),
    mv('Earthquake', 'Physical', { power: 100 }),
    mv('Flamethrower', 'Special', { power: 90 }),
    mv('Scald', 'Special', { power: 80 }),
  ].map((m) => [m.id, m]),
);

const PHYS: BaseStats = { hp: 80, atk: 130, def: 80, spa: 50, spd: 80, spe: 90 };
const mon = (id: string, over: Partial<Pokemon> = {}): Pokemon =>
  ({
    id, name: id, dex: 1, types: ['Normal'], abilities: ['Pressure'], hiddenAbilities: [],
    baseStats: { ...PHYS }, eggGroups: [], moves: [], ...over,
  }) as Pokemon;

const detail = (over: Partial<MemberDetail> = {}): MemberDetail => ({
  item: null, ability: null, nature: null, level: null, ivs: null, evs: null, moves: null, ...over,
});

const slot = (p: Pokemon, mvs: string[]): RoleSlotInput => ({ p, detail: detail({ moves: mvs }) });
const noIntel = () => null;

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

describe('auditTeam', () => {
  it('flags no-hazard-setter AND no-special-attacker on an all-physical no-hazard team', () => {
    const team = ['a', 'b', 'c', 'd'].map((id) => slot(mon(id), ['Close Combat', 'Earthquake']));
    const ids = auditTeam(team, noIntel, moves).gaps.map((g) => g.id);
    expect(ids).toContain('no-hazard-setter');
    expect(ids).toContain('no-special-attacker');
    expect(ids).not.toContain('no-physical-attacker');
  });

  it('returns gaps sorted by severity (critical → warning → info)', () => {
    // 4 Flying mons (Rock-weak), all-physical, no hazard control -> mixed severities.
    const team = ['a', 'b', 'c', 'd'].map((id) =>
      slot(mon(id, { types: ['flying'], baseStats: { ...PHYS, spe: 60 } }), ['Close Combat', 'Earthquake']),
    );
    const gaps = auditTeam(team, noIntel, moves).gaps;
    for (let i = 1; i < gaps.length; i++) {
      expect(RANK[gaps[i].severity]).toBeGreaterThanOrEqual(RANK[gaps[i - 1].severity]);
    }
    expect(gaps.some((g) => g.id === 'hazard-weak-no-control' && g.severity === 'critical')).toBe(true);
  });

  it('does NOT flag hazard-weak-no-control when the team is not hazard-weak', () => {
    const team = [slot(mon('n', { types: ['normal'] }), ['Close Combat']),
      slot(mon('w', { types: ['water'] }), ['Scald'])];
    const ids = auditTeam(team, noIntel, moves).gaps.map((g) => g.id);
    expect(ids).not.toContain('hazard-weak-no-control');
  });

  it('flags redundant-setup (info, no fill) when 4 setup sweepers', () => {
    const team = ['a', 'b', 'c', 'd'].map((id) => slot(mon(id), ['Swords Dance', 'Close Combat']));
    const gap = auditTeam(team, noIntel, moves).gaps.find((g) => g.id === 'redundant-setup');
    expect(gap).toBeTruthy();
    expect(gap?.fillRole).toBeNull();
  });

  it('checklist marks present roles and names who fills them', () => {
    const team = [slot(mon('ttar', { baseStats: { ...PHYS, atk: 134 } }), ['Stealth Rock', 'Earthquake'])];
    const row = auditTeam(team, noIntel, moves).checklist.find((r) => r.role === 'hazard-setter');
    expect(row?.present).toBe(true);
    expect(row?.filledBy).toContain('ttar');
  });

  it('suppresses nag gaps for a sub-3 partial team', () => {
    const team = [slot(mon('solo'), ['Close Combat'])];
    const ids = auditTeam(team, noIntel, moves).gaps.map((g) => g.id);
    expect(ids).not.toContain('no-hazard-setter');
    expect(ids).not.toContain('no-pivot');
  });
});

describe('suggestForGap', () => {
  const wallGap: CompositionGap = { id: 'no-defensive-backbone', severity: 'warning', message: '', fillRole: 'wall' };
  const bulkyRegen = (id: string): Pokemon =>
    mon(id, { abilities: ['Regenerator'], baseStats: { hp: 100, atk: 60, def: 130, spa: 70, spd: 120, spe: 40 } });

  it('returns PC candidates before dex fallback for a wall gap', () => {
    const team = [mon('atk')];
    const pcMons = [bulkyRegen('slowbro')];
    const dex = [bulkyRegen('amoonguss')];
    const res = suggestForGap(wallGap, team, pcMons, dex, null, moves, noIntel, 3);
    expect(res.length).toBeGreaterThan(0);
    expect(res[0].source).toBe('pc');
    expect(res[0].reason.startsWith('From your PC')).toBe(true);
  });

  it('returns [] for a redundancy gap with no fill role', () => {
    const gap: CompositionGap = { id: 'redundant-setup', severity: 'info', message: '', fillRole: null };
    expect(suggestForGap(gap, [mon('a')], [mon('b')], [mon('c')], null, moves, noIntel)).toEqual([]);
  });
});
