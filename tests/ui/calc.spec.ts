import { spilledText } from './checks';
import { test, expect, openTool, snap } from './fixtures';

test('team view compares every roster member against the opposing active', async ({ app }, testInfo) => {
  await openTool(app, 'Battle', 'Damage Calc');
  const imports = app.getByRole('button', { name: 'IMPORT', exact: true });

  await imports.first().click();
  await app.getByLabel('Load a saved team').selectOption({ label: 'Main' });

  await imports.nth(1).click();
  await app.getByPlaceholder(/Garchomp @ Leftovers/).fill('Great Tusk @ Booster Energy\nAbility: Protosynthesis\n- Headlong Rush\n- Ice Spinner\n- Rapid Spin\n- Knock Off');
  await app.getByRole('button', { name: 'IMPORT PASTE' }).click();

  await app.getByRole('button', { name: 'Team', exact: true }).click();
  const matrix = app.locator('[data-ui="team-matrix"]');
  await expect(matrix.getByRole('button', { name: 'OPEN' })).toHaveCount(6);
  await expect(matrix).toContainText('Into Great Tusk');
  await expect(matrix).toContainText('Headlong Rush');
  expect(await app.evaluate(spilledText)).toEqual([]);
  await snap(app, testInfo, 'calc-team');

  await matrix.getByRole('button', { name: 'OPEN' }).nth(2).click();
  await expect(app.getByRole('button', { name: 'Matchup', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(app.locator('[data-ui="page-subtitle"]')).toContainText('Gengar vs Great Tusk');
});
