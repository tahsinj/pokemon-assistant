// Starts the built app in Electron, loads it from disk the way the installed
// app does, and plays the opening of a practice battle. Catches problems that
// only show up over file:// (module workers, asset paths).
//
// Usage: npm run build && node scripts/electron-smoke.mjs
// Needs a display; on Linux CI run it under xvfb-run.
import { _electron as electron } from '@playwright/test';
import path from 'node:path';

const app = await electron.launch({ args: ['--no-sandbox', '.'] });
const fail = async (msg) => {
  console.error(msg);
  await app.close();
  process.exit(1);
};
try {
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  // Unpackaged Electron points at the dev server; load the production build instead.
  await app.evaluate(({ BrowserWindow }, file) => BrowserWindow.getAllWindows()[0].loadFile(file), path.resolve('dist/index.html'));
  await win.getByRole('button', { name: 'Battle', exact: true }).click({ timeout: 30_000 });
  await win.getByRole('tab', { name: 'Practice' }).click();
  await win.getByRole('button', { name: 'START BATTLE' }).click();
  await win.locator('[data-ui="battle-controls"]').waitFor({ timeout: 30_000 });
  const alerts = await win.locator('[role=alert]').allInnerTexts();
  if (alerts.length) await fail(`Practice reported: ${alerts.join(' ')}`);
  if (!win.workers().some((w) => w.url().includes('practice.worker'))) await fail('The practice worker did not start.');
  if (errors.length) await fail(`Page errors: ${errors.join(' | ')}`);
  console.log('electron smoke: practice battle started in the worker over file://');
  await app.close();
} catch (e) {
  await fail(e instanceof Error ? e.message : String(e));
}
