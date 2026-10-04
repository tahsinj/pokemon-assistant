import * as checks from './checks';
import { test, expect, openTool, snap } from './fixtures';

test('a practice battle against the random bot plays to the end', async ({ app }, testInfo) => {
  test.setTimeout(120_000);
  await openTool(app, 'Battle', 'Practice');
  await app.getByRole('button', { name: 'Random', exact: true }).first().click();
  await app.getByRole('button', { name: 'Random', exact: true }).nth(1).click();
  await app.getByRole('button', { name: '0 · Random' }).click();
  await app.getByRole('button', { name: 'START BATTLE' }).click();

  const controls = app.locator('[data-ui="battle-controls"]');
  const result = app.locator('[data-ui="battle-result"]');
  await expect(controls.or(result).first()).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 400 && !(await result.isVisible()); i++) {
    const choice = controls.locator('[data-ui="choice"]:enabled').first();
    if (await choice.isVisible()) {
      await choice.click();
      await expect(app.locator('[data-ui="practice-battle"]')).toBeVisible();
    }
    if (i === 2 && (await app.getByRole('button', { name: 'HINT' }).isEnabled())) {
      await app.getByRole('button', { name: 'HINT' }).click();
      const hints = app.locator('[data-ui="hints"]');
      await expect(hints).toBeVisible({ timeout: 20_000 });
      await hints.locator('[data-ui="choice"]').first().click();
    }
    if (i === 3) {
      for (const [name, check] of Object.entries(checks)) expect(await app.evaluate(check), name).toEqual([]);
      await snap(app, testInfo, 'practice-midgame');
    }
  }
  await expect(result).toHaveText(/won|Tie/);
  await expect(app.locator('[data-ui="battle-log"]')).toContainText('won the battle');
  await snap(app, testInfo, 'practice-end');
});
