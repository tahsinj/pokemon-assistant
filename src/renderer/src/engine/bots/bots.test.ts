import { describe, expect, it } from 'vitest';
import { greedyBot } from './greedy';
import { randomBot } from './random';
import { series } from './match';

describe('bots', () => {
  it('greedy beats random most of the time', () => {
    const { score, games } = series(greedyBot, randomBot(42), 40);
    expect(score / games).toBeGreaterThanOrEqual(0.85);
  }, 120_000);
});
