import { describe, expect, it } from 'vitest';
import { describeLine } from './describe';

const names = { p1: 'You', p2: 'Greedy' };

describe('describeLine', () => {
  it('writes common events as sentences from your point of view', () => {
    expect(describeLine('|switch|p1a: Garchomp|Garchomp, L100, M|319/319', names)).toBe('You sent out Garchomp.');
    expect(describeLine('|switch|p2a: Dondozo|Dondozo, L100|100/100', names)).toBe('Greedy sent out Dondozo.');
    expect(describeLine('|move|p2a: Dondozo|Wave Crash|p1a: Garchomp', names)).toBe('The opposing Dondozo used Wave Crash.');
    expect(describeLine('|-damage|p2a: Dondozo|45/100', names)).toBe('The opposing Dondozo is down to 45%.');
    expect(describeLine('|-damage|p1a: Garchomp|120/319', names)).toBe('Garchomp is down to 120/319 HP.');
    expect(describeLine('|-boost|p1a: Garchomp|atk|2', names)).toBe("Garchomp's Attack rose sharply.");
    expect(describeLine('|-sidestart|p2: Greedy|move: Stealth Rock', names)).toBe("Stealth Rock was set on the opponent's side.");
    expect(describeLine('|win|You', names)).toBe('You won the battle!');
  });

  it('skips bookkeeping lines', () => {
    expect(describeLine('|t:|1791127955', names)).toBeNull();
    expect(describeLine('|upkeep', names)).toBeNull();
  });
});
