import { describe, expect, it } from 'vitest';
import { Engine, playOut, randomTeam, seedFrom } from './engine';
import { greedyBot, moveValue } from './bots/greedy';
import { legalChoices } from './bots/random';
import { foeSpec, ownSpec, fieldFor } from './bots/view';
import { calcDamage } from '../lib/battle/damage';
import { linesUpTo, parseReplay, replayJsonUrl } from './replay';
import { replayEvals, reviewReplay, searchReview } from './review';
import { rebuildAt } from './rebuild';
import { clientBattle } from './clientState';
import { engineContext } from './bots/setPool';

/**
 * A battle with known blunders: p1 uses its strongest damaging move on odd
 * turns (so it gets revealed) and its weakest on even turns.
 */
function blunderLog(seed: number): string {
  const engine = Engine.start({
    format: 'gen9ou',
    seed: seedFrom(seed),
    p1: { name: 'Blunder', team: randomTeam('gen9randombattle', seedFrom(seed + 1)) },
    p2: { name: 'Greedy', team: randomTeam('gen9randombattle', seedFrom(seed + 2)) },
  });
  playOut(engine, (side, req) => {
    if (side === 'p2') return greedyBot.choose(engine, side, req);
    const me = engine.battle.p1.active[0];
    const foe = engine.battle.p2.active[0];
    if (req.teamPreview || req.forceSwitch?.[0] || !me || !foe || !req.active) return legalChoices(req)[0] ?? 'default';
    const scored = req.active[0].moves
      .map((m, i) => ({ i, m, d: calcDamage(9, ownSpec(me), foeSpec(foe), m.move, fieldFor(engine.battle, 'p1')) }))
      .filter((x) => !x.m.disabled && x.d.category !== 'Status' && !x.d.isZero);
    if (!scored.length) return legalChoices(req)[0] ?? 'default';
    scored.sort((a, b) => moveValue(a.d, 100) - moveValue(b.d, 100));
    const pick = engine.turn % 2 === 0 ? scored[0] : scored[scored.length - 1];
    return `move ${pick.i + 1}`;
  });
  return engine.linesFor('spectator').join('\n');
}

describe('replays', () => {
  it('turns replay links into JSON URLs', () => {
    expect(replayJsonUrl('https://replay.pokemonshowdown.com/gen9ou-2001234567')).toBe('https://replay.pokemonshowdown.com/gen9ou-2001234567.json');
    expect(replayJsonUrl('gen9nationaldex-12345-abcdef?p2')).toBe('https://replay.pokemonshowdown.com/gen9nationaldex-12345-abcdef.json');
    expect(replayJsonUrl('not a replay')).toBeNull();
  });

  it('reads raw logs, replay JSON and saved replay pages alike', () => {
    const log = blunderLog(3);
    const raw = parseReplay(log);
    expect(raw.players).toEqual({ p1: 'Blunder', p2: 'Greedy' });
    expect(raw.turnStarts.length).toBeGreaterThan(3);
    expect(parseReplay(JSON.stringify({ log })).lines).toEqual(raw.lines);
    const html = `<html><script type="text/plain" class="battle-log-data">${log.replace(/\//g, '\\/')}</script></html>`;
    expect(parseReplay(html).lines).toEqual(raw.lines);
    expect(linesUpTo(raw, 1).at(-1)).toBe('|turn|1');
  });

  it('flags turns where a much stronger revealed move was available', () => {
    const replay = parseReplay(blunderLog(8));
    const flags = reviewReplay(replay, 'p1');
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].text).toMatch(/would have done/);
    expect(replayEvals(replay, 'p1')).toHaveLength(replay.turnStarts.length);
    // The greedy side should mostly escape criticism.
    expect(reviewReplay(replay, 'p2').length).toBeLessThan(flags.length);
  });

  it('rebuilds a turn in the simulator with the replay\'s actives, HP and fainted Pokémon', () => {
    const replay = parseReplay(blunderLog(8));
    const ctx = engineContext();
    for (const turn of [2, Math.floor(replay.turnStarts.length / 2), replay.turnStarts.length]) {
      const client = clientBattle(linesUpTo(replay, turn));
      const rebuilt = rebuildAt(replay, turn, 'p1', ctx)!;
      for (const side of ['p1', 'p2'] as const) {
        const real = client[side].active[0]!;
        const sim = rebuilt.engine.battle[side].active[0];
        expect(sim.species.name, `turn ${turn} ${side}`).toBe(real.speciesForme);
        expect(Math.abs(sim.hp / sim.maxhp - real.hp / real.maxhp)).toBeLessThan(0.02);
        expect(rebuilt.engine.battle[side].pokemonLeft).toBe(client[side].team.filter((p) => !p.fainted).length + Math.max(0, 6 - client[side].team.length));
      }
      expect(rebuilt.engine.request('p1')?.active).toBeDefined();
    }
  });

  it('the search review flags the planted blunders more than the greedy side', () => {
    const replay = parseReplay(blunderLog(8));
    const ctx = engineContext();
    const flags = searchReview(replay, 'p1', ctx);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0].text).toMatch(/search prefers/);
    expect(searchReview(replay, 'p2', ctx).length).toBeLessThan(flags.length);
  }, 120_000);
});
