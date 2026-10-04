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

describe('search bot', () => {
  it('beats random (strength against greedy is measured by npm run bots:gauntlet)', async () => {
    const { searchBot } = await import('./search');
    const { score, games } = series(searchBot({ samples: 1, replies: 2 }), randomBot(7), 6);
    expect(score / games).toBeGreaterThanOrEqual(5 / 6);
  }, 120_000);
});
