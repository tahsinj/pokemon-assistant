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

/** Open an area from the home screen's orb, switch to one of its tabs and wait for that page. */
export async function openTool(page: Page, area: string, tool: string): Promise<void> {
  await page.getByRole('button', { name: area, exact: true }).click();
  await page.getByRole('tab', { name: tool, exact: true }).click();
  await expect(page.locator('.dive-content [data-ui="page-title"]').first()).toHaveText(tool);
  await settle(page);
}

/** Wait for the page's fade-in and other finite animations, so checks and screenshots see the final layout. */
export async function settle(page: Page): Promise<void> {
  await page.locator('.dive-content.dive-stagger-in').or(page.locator('.hud-root:not(.dive-open)')).first().waitFor();
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity),
  );
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
