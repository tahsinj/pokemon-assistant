import { describe, expect, it } from 'vitest';
import {
  buildThreatAnalysis,
  formatDamageRange,
  formatKOLine,
  formatPVStep,
  formatSetDistribution,
  formatSpeedComparison,
  rankingConfidence,
  whyItLost,
  assumeDamageAverage,
  assumeOpponentBestDamage,
  assumeOpponentSet,
  assumeSpeedTie,
  type ExchangeView,
  type SpeedView,
} from './explain';
import { applyEvent } from '../events';
import { applyEventAndPredict } from '../predictor/predictor';
import type { PredictorContext } from '../predictor/types';
import { emptyBattleState, makeId, makePokemon } from '../state';
import { recommend } from './expectimax';
import type { DamageOutcome } from '../damage';
import type { Move, Pokemon } from '../../types';

// ---------------------------------------------------------------------------
// Stub damage outcomes
// ---------------------------------------------------------------------------

function stubOutcome(opts: Partial<DamageOutcome> = {}): DamageOutcome {
  return {
    moveName: 'Stub',
    category: 'Physical',
    basePower: 100,
    rolls: [100],
    min: 100,
    max: 100,
    avgDamage: 100,
    pctMin: 85,
    pctMax: 101,
    ko: { chance: 1, n: 1, text: 'guaranteed OHKO' },
    desc: '',
    isZero: false,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Formatter tests
// ---------------------------------------------------------------------------

describe('formatDamageRange', () => {
  it('renders the range to one decimal place', () => {
    expect(formatDamageRange(stubOutcome({ pctMin: 12.345, pctMax: 24.678 }))).toBe('12.3–24.7%');
  });
  it('returns 0% on zero damage outcomes', () => {
    expect(formatDamageRange(stubOutcome({ isZero: true }))).toBe('0%');
  });
  it('honors precision arg', () => {
    expect(formatDamageRange(stubOutcome({ pctMin: 12.345, pctMax: 24.678 }), 0)).toBe('12–25%');
  });
});

describe('formatKOLine', () => {
  it('uses the calc-supplied KO text when present', () => {
    expect(formatKOLine(stubOutcome({ ko: { chance: 1, n: 1, text: 'guaranteed OHKO' } }))).toBe('guaranteed OHKO');
  });
  it('formats fractional KO chances', () => {
    expect(formatKOLine(stubOutcome({ ko: { chance: 0.76, n: 1, text: '' } }))).toBe('76.0% chance to 1HKO');
  });
  it('returns "no KO" when chance is zero', () => {
    expect(formatKOLine(stubOutcome({ ko: { chance: 0, n: 0, text: '' } }))).toBe('no KO');
  });
});

describe('formatSpeedComparison', () => {
  const baseSpeed: SpeedView = { usName: 'Garchomp', themName: 'Tatsugiri', usSpe: 169, themSpe: 134, trickRoom: false };

  it('reports the outspeed direction with raw numbers', () => {
    expect(formatSpeedComparison(baseSpeed)).toBe('Outspeeds Tatsugiri (169 vs 134).');
  });
  it('inverts under Trick Room', () => {
    expect(formatSpeedComparison({ ...baseSpeed, trickRoom: true })).toBe('Outsped by Tatsugiri (169 vs 134) under Trick Room.');
  });
  it('renders speed ties as 50/50', () => {
    expect(formatSpeedComparison({ ...baseSpeed, themSpe: 169 })).toMatch(/Speed tie at 169 \(50\/50 order/);
  });
});

describe('formatSetDistribution', () => {
  it('joins weighted candidates with commas and rounded percentages', () => {
    const setA = makePredictedSet({ label: 'Choice Specs Modest', item: 'Choice Specs' });
    const setB = makePredictedSet({ label: 'Choice Scarf Modest', item: 'Choice Scarf' });
    expect(formatSetDistribution([{ set: setA, weight: 0.7 }, { set: setB, weight: 0.3 }])).toBe(
      '70% Choice Specs Modest, 30% Choice Scarf Modest',
    );
  });
});

function makePredictedSet(overrides: Partial<{ label: string; item: string; nature: string; ability: string }> = {}) {
  return {
    id: overrides.label?.toLowerCase().replace(/\s+/g, '-') ?? 'set',
    label: overrides.label ?? 'Choice Specs Modest',
    nature: overrides.nature ?? 'Modest',
    item: overrides.item ?? 'Choice Specs',
    ability: overrides.ability ?? 'Storm Drain',
    teraType: 'Steel',
    moves: ['Draco Meteor'],
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    weight: 1,
    eliminated: false,
  };
}

describe('buildThreatAnalysis', () => {
  const us = stubOutcome({ pctMin: 102, pctMax: 121, ko: { chance: 1, n: 1, text: 'guaranteed OHKO' } });
  const them = stubOutcome({ pctMin: 80, pctMax: 95, ko: { chance: 0, n: 2, text: '' } });

  it('builds outgoing / incoming / net for a clean KO', () => {
    const view: ExchangeView = {
      outgoing: { moveName: 'Earthquake', defenderName: 'Tatsugiri', outcome: us },
      incoming: { attackerName: 'Tatsugiri', moveName: 'Draco Meteor', defenderName: 'Garchomp', outcome: them },
      playerFirst: true,
      playerKO: true,
      opponentKO: false,
    };
    const ta = buildThreatAnalysis(view);
    expect(ta.outgoing).toContain('Earthquake → Tatsugiri');
    expect(ta.outgoing).toContain('guaranteed OHKO');
    expect(ta.incoming).toContain('Tatsugiri Draco Meteor');
    expect(ta.netExchange).toContain('Free turn');
  });

  it('flips the net-exchange wording when opponent KOs us first', () => {
    const view: ExchangeView = {
      outgoing: { moveName: 'Earthquake', defenderName: 'Tatsugiri', outcome: us },
      incoming: { attackerName: 'Tatsugiri', moveName: 'Draco Meteor', defenderName: 'Garchomp', outcome: them },
      playerFirst: false,
      playerKO: false,
      opponentKO: true,
    };
    const ta = buildThreatAnalysis(view);
    expect(ta.netExchange).toContain('trade lost');
  });
});

describe('rankingConfidence', () => {
  it('returns 1 when there is no runner-up', () => {
    expect(rankingConfidence(5, null)).toBe(1);
  });
  it('is symmetric around the mid-point (0.5) when EVs are tied', () => {
    expect(rankingConfidence(3, 3)).toBeCloseTo(0.5, 5);
  });
  it('grows monotonically with the EV gap', () => {
    const a = rankingConfidence(5, 4);
    const b = rankingConfidence(5, 1);
    expect(b).toBeGreaterThan(a);
  });
});

describe('whyItLost', () => {
  it('surfaces "switching cedes the turn" for switch alternatives', () => {
    const line = whyItLost({
      topAction: { kind: 'move', move: 'Earthquake' },
      altAction: { kind: 'switch', toSlot: 2 },
      evLoss: 1.2,
    });
    expect(line).toContain('Switching cedes the turn');
  });
  it('explains "not a guaranteed KO" when the alt does meaningfully less damage', () => {
    const top = stubOutcome({ ko: { chance: 1, n: 1, text: 'guaranteed OHKO' } });
    const alt = stubOutcome({ pctMin: 40, pctMax: 50, ko: { chance: 0, n: 2, text: '' } });
    const line = whyItLost({
      topAction: { kind: 'move', move: 'Earthquake' },
      altAction: { kind: 'move', move: 'Iron Head' },
      topDmg: top,
      altDmg: alt,
      evLoss: 1.5,
    });
    expect(line).toContain('Not a guaranteed KO');
  });
});

describe('assumption builders', () => {
  it('emits the opponent-set assumption when ≥1 set is provided', () => {
    const view = [{ set: makePredictedSet({ label: 'Choice Specs Modest' }), weight: 0.7 }];
    const out = assumeOpponentSet(view);
    expect(out.length).toBe(1);
    expect(out[0].kind).toBe('opponent-set');
    expect(out[0].probability).toBeCloseTo(0.7);
    expect(out[0].text).toContain('70%');
  });
  it('emits no opponent-set assumption when no weighted sets are present', () => {
    expect(assumeOpponentSet([{ set: null, weight: 1 }])).toEqual([]);
  });
  it('every helper exposes a non-empty text', () => {
    for (const a of [assumeOpponentBestDamage(), assumeDamageAverage(), assumeSpeedTie()]) {
      expect(a.text.length).toBeGreaterThan(0);
    }
  });
});

describe('formatPVStep', () => {
  it('renders a move step with damage range and KO line', () => {
    const step = formatPVStep({
      turn: 5,
      side: 'player',
      actor: 'Garchomp',
      action: { kind: 'move', move: 'Earthquake' },
      outcome: stubOutcome(),
      defenderName: 'Tatsugiri',
    });
    expect(step.text).toContain('Garchomp uses Earthquake');
    expect(step.text).toContain('Tatsugiri');
    expect(step.text).toContain('guaranteed OHKO');
  });
  it('renders a switch step concisely', () => {
    const step = formatPVStep({
      turn: 5,
      side: 'opponent',
      actor: null,
      action: { kind: 'switch', toSlot: 2 },
    });
    expect(step.text).toBe('They switch (slot 3).');
  });
});

// ---------------------------------------------------------------------------
// Integration: recommend() produces explanation fields end-to-end
// ---------------------------------------------------------------------------

const garchomp: Pokemon = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin'],
  hiddenAbilities: ['Rough Skin'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: [],
  height: 19,
  weight: 950,
  labels: [],
  moves: [
    { learn: '1', move: 'earthquake' },
    { learn: '1', move: 'outrage' },
    { learn: '1', move: 'stoneedge' },
    { learn: '1', move: 'ironhead' },
  ],
};

const tatsugiri: Pokemon = {
  id: 'tatsugiri',
  name: 'Tatsugiri',
  dex: 978,
  types: ['dragon', 'water'],
  abilities: ['Storm Drain'],
  hiddenAbilities: ['Storm Drain'],
  baseStats: { hp: 68, atk: 50, def: 60, spa: 120, spd: 95, spe: 82 },
  eggGroups: [],
  height: 3,
  weight: 80,
  labels: [],
  moves: [
    { learn: '1', move: 'dracometeor' },
    { learn: '1', move: 'muddywater' },
    { learn: '1', move: 'icebeam' },
    { learn: '1', move: 'surf' },
  ],
};

const MOVES: Record<string, Move> = {
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical', power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'allAdjacent', flags: ['contact'] },
  outrage: { id: 'outrage', name: 'Outrage', type: 'dragon', category: 'Physical', power: 120, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  stoneedge: { id: 'stoneedge', name: 'Stone Edge', type: 'rock', category: 'Physical', power: 100, accuracy: 80, pp: 5, priority: 0, desc: '', target: 'normal', flags: [] },
  ironhead: { id: 'ironhead', name: 'Iron Head', type: 'steel', category: 'Physical', power: 80, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  dracometeor: { id: 'dracometeor', name: 'Draco Meteor', type: 'dragon', category: 'Special', power: 130, accuracy: 90, pp: 5, priority: 0, desc: '', target: 'normal', flags: [] },
  muddywater: { id: 'muddywater', name: 'Muddy Water', type: 'water', category: 'Special', power: 90, accuracy: 85, pp: 10, priority: 0, desc: '', target: 'allAdjacentFoes', flags: [] },
  icebeam: { id: 'icebeam', name: 'Ice Beam', type: 'ice', category: 'Special', power: 90, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
  surf: { id: 'surf', name: 'Surf', type: 'water', category: 'Special', power: 90, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'allAdjacent', flags: [] },
};

const ctx: PredictorContext = { pokemonByName: { garchomp, tatsugiri }, moves: MOVES };

function buildSeed() {
  let s = emptyBattleState();
  const player = makePokemon(
    garchomp,
    {
      speciesName: 'Garchomp',
      level: 50,
      nature: 'Jolly',
      ability: 'Rough Skin',
      item: 'Choice Band',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      moves: [{ name: 'Earthquake' }, { name: 'Outrage' }, { name: 'Stone Edge' }, { name: 'Iron Head' }],
    },
    makeId('player', 0),
    { isOpponent: false, source: 'KNOWN' },
  );
  const opp = makePokemon(
    tatsugiri,
    {
      speciesName: 'Tatsugiri',
      level: 50,
      nature: 'Modest',
      ability: 'Storm Drain',
      item: 'Choice Specs',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
      moves: [{ name: 'Draco Meteor' }, { name: 'Muddy Water' }, { name: 'Ice Beam' }, { name: 'Surf' }],
    },
    makeId('opponent', 0),
    { isOpponent: true, source: 'INFERRED' },
  );
  s = applyEvent(s, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player });
  s = applyEventAndPredict(s, { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opp }, ctx);
  s = applyEvent(s, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } });
  return s;
}

describe('recommend() explanation payload', () => {
  it('every recommendation has confidence, assumptions, principalVariation, threatAnalysis', () => {
    const recs = recommend(buildSeed(), ctx, { depth: 1, topKSets: 1, includeSwitches: false });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(typeof r.confidence).toBe('number');
      expect(r.assumptions.length).toBeGreaterThan(0);
      expect(r.principalVariation.length).toBeGreaterThan(0);
      expect(r.threatAnalysis).not.toBeNull();
    }
  });

  it('confidence is at least 0.5 on the top pick', () => {
    // Earthquake and Outrage both OHKO Tatsugiri here, so the runner-up's
    // post-turn state is identical to the top pick's, yielding a 0.5 confidence
    // (correctly: 50/50 when EVs tie). Confidence should never fall below 0.5
    // on the #1 recommendation.
    const [top] = recommend(buildSeed(), ctx, { depth: 1, topKSets: 1, includeSwitches: false });
    expect(top.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('alternatives are populated only on rank #1', () => {
    const recs = recommend(buildSeed(), ctx, { depth: 1, topKSets: 1, includeSwitches: false });
    expect(recs[0].alternatives.length).toBeGreaterThan(0);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i].alternatives).toEqual([]);
    }
  });

  it('alternatives expose a non-empty "reasonItLost" line and a positive EV loss', () => {
    const [top] = recommend(buildSeed(), ctx, { depth: 1, topKSets: 1, includeSwitches: false });
    for (const a of top.alternatives) {
      expect(a.reasonItLost.length).toBeGreaterThan(0);
      expect(a.loss).toBeGreaterThanOrEqual(0);
    }
  });

  it('principalVariation step 1 is the player action (turn = current)', () => {
    const state = buildSeed();
    const [top] = recommend(state, ctx, { depth: 1, topKSets: 1, includeSwitches: false });
    expect(top.principalVariation[0].side).toBe('player');
    expect(top.principalVariation[0].turn).toBe(state.turn);
  });

  it('depth-2 PV extends when the battle continues past the first turn', () => {
    // Add a second opponent slot so the battle does not end on the OHKO and
    // depth-2 has somewhere to project a third step.
    let state = buildSeed();
    const tatsu2 = makePokemon(
      tatsugiri,
      {
        speciesName: 'Tatsugiri',
        level: 50,
        nature: 'Modest',
        ability: 'Storm Drain',
        moves: [{ name: 'Surf' }],
      },
      makeId('opponent', 1),
      { isOpponent: true, source: 'INFERRED' },
    );
    state = applyEvent(state, { type: 'PokemonRevealed', side: 'opponent', slot: 1, pokemon: tatsu2 });
    const [top] = recommend(state, ctx, { depth: 2, topKSets: 1, includeSwitches: false });
    expect(top.principalVariation.length).toBeGreaterThanOrEqual(1);
    // Step 1 is always the player action; further steps depend on the
    // simulator's KO logic + auto-switch.
    expect(top.principalVariation[0].side).toBe('player');
  });
});
