import { readFileSync } from 'node:fs';
import * as checks from './checks';
import { test, expect, openTool, snap } from './fixtures';

test('the Team Builder builds teams from the box with the team model, and Classic stays available', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`);
  await app.route(/\/__packs\/team-(gen9ou|gen9nationaldex)$/, (route) => route.fulfill({ body: fixture('team-tiny.onnx') }));
  await app.route(/\/__packs\/team-vocab-/, (route) => route.fulfill({ body: fixture('team-vocab-tiny.json') }));
  await app.route(/\/__packs\/meta-teams-/, (route) => route.fulfill({ body: fixture('meta-teams-tiny.json') }));
  await app.evaluate(() => {
    (window as unknown as { stablabTestPacks: boolean }).stablabTestPacks = true;
  });
  await openTool(app, 'Box', 'Team Builder');
  await app.getByRole('button', { name: /ANALYZE PC/ }).click();
  const source = app.locator('[data-ui="team-source"]');
  await expect(source).toContainText('Team model: the meta score', { timeout: 60_000 });
  await expect(app.getByText('Hardest meta teams').first()).toBeVisible();
  for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'team-model');
  await app.getByRole('button', { name: 'Classic', exact: true }).click();
  await expect(source).toContainText('Classic: a weighted sum');
});
