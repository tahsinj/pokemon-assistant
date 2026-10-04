import { describe, expect, it } from 'vitest';
import { BattleStreams } from '@pkmn/sim';
import { Engine, playOut, randomTeam, seedFrom, validateTeam } from './engine';
import { randomChoice, seededRandom } from './bots/random';

/** Two random teams played under Gen 9 OU rules with random choices, all from one number. */
function randomGame(n: number): Engine {
  const engine = Engine.start({
    format: 'gen9ou',
    seed: seedFrom(n),
    p1: { name: 'Alice', team: randomTeam('gen9randombattle', seedFrom(n + 1000)) },
    p2: { name: 'Bob', team: randomTeam('gen9randombattle', seedFrom(n + 2000)) },
  });
  const rand = seededRandom(n);
  playOut(engine, (_side, req) => randomChoice(req, rand));
  return engine;
}

/** Logs without the wall-clock timestamp lines, which differ between runs. */
const timeless = (log: readonly string[]) => log.filter((l) => !l.startsWith('|t:|'));

/** Feed an input log to a stock BattleStream and return the battle it produced. */
async function replayInputs(inputLog: readonly string[]) {
  const stream = new BattleStreams.BattleStream();
  for (const line of inputLog) await stream.write(line);
  return stream.battle!;
}

describe('engine', () => {
  it('plays 50 seeded random battles to the end, and the stock simulator reproduces each log', async () => {
    for (let n = 1; n <= 50; n++) {
      const game = randomGame(n);
      expect(game.ended, `game ${n} ended`).toBe(true);
      const stock = await replayInputs(game.inputLog);
      expect(timeless(stock.log), `game ${n} log`).toEqual(timeless(game.log));
    }
  }, 60_000);

  it('is deterministic for a seed', () => {
    expect(timeless(randomGame(7).log)).toEqual(timeless(randomGame(7).log));
  });

  it('clones independently', () => {
    const engine = Engine.start({
      format: 'gen9ou',
      seed: seedFrom(3),
      p1: { name: 'A', team: randomTeam('gen9randombattle', seedFrom(4)) },
      p2: { name: 'B', team: randomTeam('gen9randombattle', seedFrom(5)) },
    });
    engine.choose('p1', 'default');
    engine.choose('p2', 'default');
    const copy = engine.clone();
    const before = engine.log.length;
    const rand = seededRandom(1);
    playOut(copy, (_side, req) => randomChoice(req, rand));
    expect(copy.ended).toBe(true);
    expect(engine.log.length).toBe(before);
    expect(engine.ended).toBe(false);
  });

  it('splits secret lines per player', () => {
    const game = randomGame(11);
    const p1 = game.linesFor('p1').join('\n');
    const spectator = game.linesFor('spectator').join('\n');
    expect(p1).not.toContain('|split|');
    // Players see exact HP for their own side; spectators only percentages.
    expect(p1).toMatch(/\|p1a: [^|]+\|\d+\/\d+/);
    expect(spectator).not.toMatch(/\|p1a: [^|]+\|\d+\/(?!100\b)\d+/);
  });

  it('validates teams against the format', () => {
    const legal = 'Garchomp @ Rocky Helmet\nAbility: Rough Skin\nEVs: 252 HP / 4 Def / 252 Spe\nJolly Nature\n- Earthquake\n- Dragon Tail\n- Stealth Rock\n- Spikes';
    expect(validateTeam('gen9ou', legal)).toEqual([]);
    expect(validateTeam('gen9ou', 'Koraidon @ Choice Scarf\nAbility: Orichalcum Pulse\n- Flare Blitz').join(' ')).toMatch(/Koraidon/);
  });
});
