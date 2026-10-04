import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { installAssistantStub } from './stub';

export { expect };

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // Sprites and fonts come from the network; block it so runs are fast and
    // repeatable. Sprites fall back to their letter glyphs.
    await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort());
    await page.addInitScript(installAssistantStub);
    await page.goto('/');
    await expect(page.getByText(/SYNCING DATA/)).toHaveCount(0, { timeout: 20_000 });
    await use(page);
    expect(errors, 'uncaught page errors').toEqual([]);
  },
});

/** Open a tool from the home screen's hex ring and wait for its page header. */
export async function openTool(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await expect(page.locator('.dive-content [data-ui="page-title"]').first()).toBeVisible();
  await page.waitForTimeout(300);
}

export async function pickFormat(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByText(/SYNCING DATA/)).toHaveCount(0, { timeout: 20_000 });
}

/** Full-page screenshot attached to the report and kept with the test output. */
export async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
