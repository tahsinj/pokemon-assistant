import { describe, it, expect } from 'vitest';
import { draftCounterTeam, evaluateTeam } from './counterDraft';
import type { Pokemon, Move } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import type { MatchupCell } from './matchup';

const mon = (id: string): Pokemon => ({ id, name: id, dex: 1, types: ['Normal'], baseStats: { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 }, abilities: ['x'], moves: [] } as unknown as Pokemon);
const rec = (id: string): { rec: PcPokemonRecord; p: Pokemon } => ({ rec: { id: `pc-${id}`, speciesId: id, speciesDisplay: id, nickname: '', level: 100, nature: 'Hardy', ability: null, item: null, ivs: null, evs: null, moves: [], boxId: 'b' } as unknown as PcPokemonRecord, p: mon(id) });

const cell = (verdict: MatchupCell['verdict'], score: number, faster = true): MatchupCell =>
  ({ verdict, label: verdict, sub: '', iAmFaster: faster, myKoChance: verdict === 'win' ? 1 : 0, theirPctMax: 50, moveName: 'Tackle', score });

describe('draftCounterTeam', () => {
  it('covers every opponent it can and names the biggest hole', () => {
    const opponents = [{ p: mon('A'), level: 100 }, { p: mon('B'), level: 100 }, { p: mon('C'), level: 100 }];
    const candidates = [rec('beatsA'), rec('beatsB'), rec('beatsC'), rec('weak')];
    const evaluate = (pc: { p: Pokemon }, opp: { p: Pokemon }): MatchupCell =>
      pc.p.id === `beats${opp.p.id}` ? cell('win', 90) : cell('lose', -40);
    const res = draftCounterTeam(opponents, candidates, {} as Record<string, Move>, null, 'maxIv', evaluate);
    expect(res.team.map((t) => t.p.id).sort()).toEqual(['beatsA', 'beatsB', 'beatsC']);
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
    const res = draftCounterTeam(opponents, candidates, {} as Record<string, Move>, null, 'maxIv', evaluate);
    expect(res.tips.biggestHole?.oppId).toBe('Z');
  });

  it('respects the 6-cap and a small candidate pool', () => {
    const res = draftCounterTeam([{ p: mon('A'), level: 100 }], [rec('only')], {} as Record<string, Move>, null, 'maxIv', () => cell('win', 50));
    expect(res.team).toHaveLength(1);
    expect(res.matrix).toHaveLength(1);
  });
});

describe('evaluateTeam', () => {
  it('re-scores a FIXED team under a different bulk tier (verdict can flip)', () => {
    const team = [rec('mon')];
    const opponents = [{ p: mon('A'), level: 100 }];
    // Evaluator keyed off the assumed set's HP EVs: 0 EV (min/maxIv) => win, invested => trade.
    const evaluate = (_pc: { p: Pokemon }, opp: { set: { evs: { hp: number } } }): MatchupCell =>
      opp.set.evs.hp === 0 ? cell('win', 90) : cell('trade', 10);

    const easy = evaluateTeam(team, opponents, {} as Record<string, Move>, null, 'maxIv', evaluate);
    const hard = evaluateTeam(team, opponents, {} as Record<string, Move>, null, 'competitive', evaluate);

    expect(easy.matrix[0][0].verdict).toBe('win');
    expect(hard.matrix[0][0].verdict).toBe('trade');
    expect(easy.oppOrder).toEqual(opponents);
  });
});
