import { duplicateRows, rawAbilityIds, truncatedNames } from './checks';
import { test, expect, openTool } from './fixtures';

test('species lists label forms and keep names readable', async ({ app }) => {
  await openTool(app, 'Dex', 'Pokédex');
  await app.getByLabel('Search species by name').fill('charizard');
  const rows = app.locator('[data-ui="species-row"]');
  await expect(rows.filter({ hasText: 'Mega X' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Mega Y' })).toHaveCount(1);
  expect(await app.evaluate(duplicateRows)).toEqual([]);
  expect(await app.evaluate(truncatedNames)).toEqual([]);
});

test('the Pokédex shows ability display names', async ({ app }) => {
  await openTool(app, 'Dex', 'Pokédex');
  await app.getByLabel('Search species by name').fill('venusaur');
  await app.locator('[data-ui="species-row"]').first().click();
  await expect(app.locator('[data-ui="ability"]').first()).toHaveText('Overgrow');
  await expect(app.locator('[data-ui="ability"]', { hasText: 'Chlorophyll (H)' })).toHaveCount(1);
  expect(await app.evaluate(rawAbilityIds)).toEqual([]);
});

test('the Team Builder opens on the newest saved team and keeps edits across tabs', async ({ app }) => {
  await openTool(app, 'Box', 'Team Builder');
  await expect(app.getByText('Loaded “Main”.')).toBeVisible();
  await expect(app.locator('.dive-content')).toContainText('Garchomp');

  await app.getByRole('tab', { name: 'PC Box' }).click();
  await app.getByRole('tab', { name: 'Team Builder' }).click();
  await expect(app.locator('.dive-content')).toContainText('Garchomp');
  await expect(app.getByText('Loaded “Main”.')).toHaveCount(0);
});
