import { readFileSync } from 'node:fs';
import * as checks from './checks';
import * as checks_ from './checks';
import { test, expect, openTool, snap } from './fixtures';
import type { Page } from '@playwright/test';

async function draftAgainst(app: Page, species: string[]) {
  await openTool(app, 'Counters', 'Counter Draft');
  for (const name of species) {
    await app.getByRole('button', { name: /add mon/ }).click();
    await app.getByPlaceholder('Search species…').fill(name);
    await app.locator('[data-ui="species-row"]').first().click();
  }
  await app.getByRole('button', { name: /Draft from my PC/ }).click();
}

test('Counter Draft scores with the calc rules when no model is downloaded, and verifies by playing', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  await draftAgainst(app, ['Gholdengo', 'Great Tusk']);
  await expect(app.locator('[data-ui="score-source"]')).toContainText('damage calc rules');
  await app.getByRole('button', { name: 'VERIFY IN 200 BATTLES' }).click();
  await expect(app.locator('[data-ui="verify"]')).toContainText(/after \d+ of 200 battles/, { timeout: 90_000 });
  await app.getByRole('button', { name: 'STOP' }).click();
  await expect(app.locator('[data-ui="verify"]')).toContainText('stopped');
  await expect(app.getByRole('button', { name: /Dmax/ })).toHaveCount(0);
  for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'counter-draft');
});

test('Counter Draft runs the matchup model when its pack is there', async ({ app }) => {
  const model = readFileSync('tests/fixtures/matchup-tiny.onnx');
  await app.route('**/__packs/matchup-gen9ou.onnx', (route) => route.fulfill({ body: model, contentType: 'application/octet-stream' }));
  await app.evaluate(() => {
    (window as unknown as { stablabTestPacks: boolean }).stablabTestPacks = true;
  });
  await draftAgainst(app, ['Gholdengo']);
  await expect(app.locator('[data-ui="score-source"]')).toContainText('matchup model', { timeout: 20_000 });
});

test('Checks ranks the box and the meta against one Pokémon, and the Pokédex sends you there', async ({ app }, testInfo) => {
  await openTool(app, 'Dex', 'Pokédex');
  await app.getByPlaceholder('Search species…').fill('Gholdengo');
  await app.locator('[data-ui="species-row"]').first().click();
  await app.getByRole('button', { name: 'FIND CHECKS' }).click();
  await expect(app.locator('.dive-content [data-ui="page-title"]').first()).toHaveText('Checks');
  const checks = app.locator('[data-ui="checks"]');
  await expect(checks.locator('[data-ui="species-row"]').first()).toBeVisible({ timeout: 20_000 });
  await expect(app.locator('[data-ui="score-source"]')).toContainText('Gholdengo');
  await app.locator('.dive-content').getByRole('button', { name: 'Meta', exact: true }).click();
  await expect(checks).toContainText('usage');
  for (const [name, check] of Object.entries(checks_)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'checks');
});

test('the Raid Planner ranks the box against a boss and simulates the best', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  await openTool(app, 'Counters', 'Raid Planner');
  await app.getByPlaceholder('Search species…').fill('Heatran');
  await app.locator('[data-ui="species-row"]').first().click();
  const raid = app.locator('[data-ui="raid"]');
  await expect(raid.locator('[data-ui="species-row"]').first()).toBeVisible();
  await app.locator('[data-ui="raid-rules"]').getByRole('button', { name: 'Brutal' }).click();
  await expect(app.getByLabel('HP x')).toHaveValue('8');
  await app.getByRole('button', { name: /SIMULATE TOP/ }).click();
  await expect(raid).toContainText('Simulated: wins', { timeout: 90_000 });
  for (const [name, check] of Object.entries(checks_)) expect(await app.evaluate(check), name).toEqual([]);
  await snap(app, testInfo, 'raid');
});
