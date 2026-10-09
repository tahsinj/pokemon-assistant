// Starts the built app in Electron, loads it from disk the way the installed
// app does, plays the opening of a practice battle, and runs the matchup
// model from a data pack. Catches problems that only show up over file://
// (module workers, wasm and asset paths).
//
// Usage: npm run build && node scripts/electron-smoke.mjs
// Needs a display; on Linux CI run it under xvfb-run.
import { _electron as electron } from '@playwright/test';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A pack manifest on disk with the test model, and a fresh user data folder for it.
const packsDir = mkdtempSync(path.join(tmpdir(), 'stablab-packs-'));
const model = readFileSync('tests/fixtures/matchup-tiny.onnx');
copyFileSync('tests/fixtures/matchup-tiny.onnx', path.join(packsDir, 'matchup-gen9ou-test.onnx'));
writeFileSync(
  path.join(packsDir, 'packs.json'),
  JSON.stringify({
    generated: 'test',
    packs: [{ name: 'matchup-gen9ou', kind: 'model', format: 'gen9ou', version: 'test', file: 'matchup-gen9ou-test.onnx', size: model.length, sha256: createHash('sha256').update(model).digest('hex') }],
  }),
);
const userData = mkdtempSync(path.join(tmpdir(), 'stablab-user-'));

const app = await electron.launch({
  args: ['--no-sandbox', '.', `--user-data-dir=${userData}`],
  env: { ...process.env, STABLAB_LOAD_BUILD: '1', STABLAB_PACKS_URL: pathToFileURL(path.join(packsDir, 'packs.json')).href },
});
const fail = async (msg) => {
  console.error(msg);
  await app.close();
  process.exit(1);
};
try {
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForLoadState('domcontentloaded');
  if (!win.url().startsWith('file:')) await fail(`Expected the built app over file://, got ${win.url()}`);
  await win.getByRole('button', { name: 'Battle', exact: true }).click({ timeout: 30_000 });
  await win.getByRole('tab', { name: 'Practice' }).click();
  await win.getByRole('button', { name: 'START BATTLE' }).click();
  await win.locator('[data-ui="battle-controls"]').waitFor({ timeout: 30_000 });
  const alerts = await win.locator('[role=alert]').allInnerTexts();
  if (alerts.length) await fail(`Practice reported: ${alerts.join(' ')}`);
  if (!win.workers().some((w) => w.url().includes('practice.worker'))) await fail('The practice worker did not start.');

  await win.getByRole('button', { name: 'Close' }).click();
  await win.getByRole('button', { name: 'Counters', exact: true }).click();
  await win.getByRole('tab', { name: 'Checks' }).click();
  await win.getByPlaceholder('Search species…').fill('Gholdengo');
  await win.locator('[data-ui="species-row"]').first().click();
  // Only the model worker can produce this text; the fallback says otherwise.
  await win.locator('[data-ui="score-source"]').filter({ hasText: 'matchup model' }).waitFor({ timeout: 30_000 });

  if (errors.length) await fail(`Page errors: ${errors.join(' | ')}`);
  console.log('electron smoke: practice battle and the matchup model both ran in workers over file://');
  await app.close();
} catch (e) {
  await fail(e instanceof Error ? e.message : String(e));
}
