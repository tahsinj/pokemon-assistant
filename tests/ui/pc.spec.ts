import * as checks from './checks';
import { test, expect, openTool, snap } from './fixtures';

test('moves to teach follow the format toggle without closing the PC box', async ({ app }, testInfo) => {
  await openTool(app, 'Box', 'PC Box');
  await expect(app.getByRole('button', { name: /Moves to teach/ })).toBeVisible();
  await expect(app.getByText(/Pick from \d+ moves the Pokémon in this box can learn in this format/)).toBeVisible();
  const natdex = Number((await app.getByText(/Pick from \d+ moves/).innerText()).match(/\d+/)![0]);

  const toggle = app.locator('[data-ui="teach-format"]');
  await toggle.getByRole('button', { name: 'Gen 9 OU' }).click();
  await expect(toggle.getByRole('button', { name: 'Gen 9 OU' })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
  await expect(app.locator('.dive-content [data-ui="page-title"]')).toHaveText('PC Box');
  const gen9 = Number((await app.getByText(/Pick from \d+ moves/).innerText()).match(/\d+/)![0]);
  // Gen 9 OU drops moves only older games teach, so the box can learn fewer moves.
  expect(gen9).toBeLessThan(natdex);

  for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
  await app.getByRole('button', { name: /Moves to teach/ }).scrollIntoViewIfNeeded();
  await snap(app, testInfo, 'pc-teach');
});
