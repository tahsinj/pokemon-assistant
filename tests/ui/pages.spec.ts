import { AREAS, TOOL_NAMES } from '../../src/renderer/src/lib/areas';
import * as checks from './checks';
import { test, expect, openTool, snap } from './fixtures';

test('the orb shows one hex per area', async ({ app }, testInfo) => {
  for (const area of AREAS) await expect(app.getByRole('button', { name: area.label, exact: true })).toBeVisible();
  await snap(app, testInfo, 'home');
});

for (const area of AREAS) {
  for (const tool of area.tools) {
    const name = TOOL_NAMES[tool];
    test(`${area.label} / ${name} opens without errors`, async ({ app }, testInfo) => {
      await openTool(app, area.label, name);
      await expect(app).toHaveTitle(`${name} · ${area.label} · STAB Lab`);
      for (const [name, check] of Object.entries(checks)) {
        expect(await app.evaluate(check), name).toEqual([]);
      }
      await snap(app, testInfo, `${area.id}-${tool}`);
    });
  }
}

test('the home bottom bar fits on one row', async ({ app }) => {
  const bar = app.locator('[data-ui="home-bar"]');
  const rows = await bar.evaluate((el) => new Set(Array.from(el.children).map((c) => Math.round(c.getBoundingClientRect().bottom))).size);
  expect(rows).toBe(1);
});

test('arrow keys move between tabs', async ({ app }) => {
  await openTool(app, 'Box', 'PC Box');
  await app.getByRole('tab', { name: 'PC Box' }).focus();
  await app.keyboard.press('ArrowRight');
  await expect(app.getByRole('tab', { name: 'Team Builder' })).toHaveAttribute('aria-selected', 'true');
  await expect(app.locator('.dive-content [data-ui="page-title"]')).toHaveText('Team Builder');
});

test('Escape closes the open area', async ({ app }) => {
  await openTool(app, 'Box', 'Team Builder');
  await app.keyboard.press('Escape');
  await expect(app).toHaveTitle('STAB Lab');
});
