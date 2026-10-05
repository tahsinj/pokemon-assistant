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
import type { DamageOutcome } from '../damage';

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
