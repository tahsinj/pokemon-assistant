import * as checks from './checks';
import { test, expect, openTool, snap } from './fixtures';
import { Engine, playOut, randomTeam, seedFrom } from '../../src/renderer/src/engine/engine';
import { greedyBot } from '../../src/renderer/src/engine/bots/greedy';

function battleLog(): string {
  const engine = Engine.start({
    format: 'gen9ou',
    seed: seedFrom(4),
    p1: { name: 'Ash', team: randomTeam('gen9randombattle', seedFrom(5)) },
    p2: { name: 'Gary', team: randomTeam('gen9randombattle', seedFrom(6)) },
  });
  playOut(engine, (side, req) => greedyBot.choose(engine, side, req));
  return engine.linesFor('spectator').join('\n');
}

test('a saved battle log opens in replay review and steps through turns', async ({ app }, testInfo) => {
  await openTool(app, 'Battle', 'Replay Review');
  await app.getByLabel('Open a saved replay or battle log').setInputFiles({
    name: 'battle.log',
    mimeType: 'text/plain',
    buffer: Buffer.from(battleLog()),
  });
  await expect(app.locator('[data-ui="page-subtitle"]')).toContainText('Ash vs Gary');
  await expect(app.locator('[data-ui="turn"]')).toHaveText('Team preview');
  await app.getByRole('button', { name: 'Next turn' }).click();
  await expect(app.locator('[data-ui="turn"]')).toHaveText(/Turn 1 of \d+/);
  await expect(app.locator('[data-ui="battle-log"]')).toContainText('Turn 1');
  await app.getByRole('button', { name: 'Last turn' }).click();
  await expect(app.locator('[data-ui="battle-log"]')).toContainText('won the battle');
  await app.getByRole('button', { name: 'Gary' }).click();
  await expect(app.locator('[data-ui="review"]')).toContainText('Gary');
  for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'replay');

  await app.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(app.locator('[data-ui="review"]')).toContainText('Rebuilds each turn');
  await expect(app.locator('[data-ui="review"]')).not.toContainText('checking turn', { timeout: 60_000 });
  for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'replay-search');
});

test('a battle entered by hand shows up like a replay', async ({ app }, testInfo) => {
  await openTool(app, 'Battle', 'Replay Review');
  await app.getByRole('button', { name: 'ENTER BY HAND' }).click();
  await app.getByLabel('Your team').fill('Garchomp, Corviknight');
  await app.getByLabel('Opponent team').fill('Rotom-Wash, Gholdengo');
  await app.getByRole('button', { name: 'START ENTRY' }).click();
  const entry = app.locator('[data-ui="manual-entry"]');
  await expect(entry).toContainText('Garchomp is in');
  await entry.getByLabel('Move').fill('Dragon Claw');
  await entry.getByLabel('Target HP after').fill('60');
  await entry.getByRole('button', { name: 'ADD' }).click();
  await entry.getByRole('button', { name: 'Opponent' }).click();
  await entry.getByLabel('Move').fill('Hydro Pump');
  await entry.getByLabel('Target HP after').fill('35');
  await entry.getByRole('button', { name: 'ADD' }).click();
  await entry.getByRole('button', { name: 'END TURN' }).click();
  const log = app.locator('[data-ui="battle-log"]');
  await expect(log).toContainText('Garchomp used Dragon Claw');
  await expect(log).toContainText('Turn 2');
  await entry.getByLabel('Move').fill('Notamove');
  await entry.getByRole('button', { name: 'ADD' }).click();
  await expect(entry.getByRole('alert')).toContainText('not a move');
  for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'replay-manual');
});
