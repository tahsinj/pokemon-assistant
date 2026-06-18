import { describe, it, expect } from 'vitest';
import { draftCounterTeam } from './counterDraft';
import type { Pokemon, Move } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import type { MatchupCell } from './matchup';

const mon = (id: string): Pokemon => ({ id, name: id, dex: 1, types: ['Normal'], baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 }, abilities: ['x'], moves: [] } as unknown as Pokemon);
const rec = (id: string): { rec: PcPokemonRecord; p: Pokemon } => ({ rec: { id: `pc-${id}`, speciesId: id, speciesDisplay: id, nickname: '', level: 100, nature: 'Hardy', ability: null, item: null, ivs: null, evs: null, moves: [], boxId: 'b' } as unknown as PcPokemonRecord, p: mon(id) });

const cell = (verdict: MatchupCell['verdict'], score: number, faster = true): MatchupCell =>
  ({ verdict, label: verdict, sub: '', iAmFaster: faster, myKoChance: verdict === 'win' ? 1 : 0, theirPctMax: 50, score });

describe('draftCounterTeam', () => {
  it('covers every opponent it can and names the biggest hole', () => {
    const opponents = [{ p: mon('A'), level: 100 }, { p: mon('B'), level: 100 }, { p: mon('C'), level: 100 }];
    const candidates = [rec('beatsA'), rec('beatsB'), rec('beatsC'), rec('weak')];
    const evaluate = (pc: { p: Pokemon }, opp: { p: Pokemon }): MatchupCell => {
      if (pc.p.id === `beats${opp.p.id}`) return cell('win', 90);
      return cell('lose', -40);
    };
    const res = draftCounterTeam(opponents, candidates, {} as Record<string, Move>, null, evaluate);
    const ids = res.team.map((t) => t.p.id).sort();
    expect(ids).toEqual(['beatsA', 'beatsB', 'beatsC']);
    expect(res.tips.perThreat.map((t) => t.oppId)).toEqual(['A', 'B', 'C']);
    expect(res.tips.lead).toBeTruthy();
  });

  it('flags an uncoverable opponent as the biggest hole', () => {
    const opponents = [{ p: mon('A'), level: 100 }, { p: mon('Z'), level: 100 }];
    const candidates = [rec('beatsA'), rec('mid')];
    const evaluate = (pc: { p: Pokemon }, opp: { p: Pokemon }): MatchupCell => {
      if (pc.p.id === 'beatsA' && opp.p.id === 'A') return cell('win', 90);
      if (pc.p.id === 'mid' && opp.p.id === 'Z') return cell('trade', 10);
      return cell('lose', -40);
    };
    const res = draftCounterTeam(opponents, candidates, {} as Record<string, Move>, null, evaluate);
    expect(res.tips.biggestHole?.oppId).toBe('Z');
  });

  it('respects the 6-cap and a small candidate pool', () => {
    const opponents = [{ p: mon('A'), level: 100 }];
    const candidates = [rec('only')];
    const evaluate = () => cell('win', 50);
    const res = draftCounterTeam(opponents, candidates, {} as Record<string, Move>, null, evaluate);
    expect(res.team).toHaveLength(1);
    expect(res.matrix).toHaveLength(1);
  });
});
