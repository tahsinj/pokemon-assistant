/**
 * One-time carry-over of the per-user data folder from the app's old name.
 *
 * Electron derives `userData` from the app name, so renaming the app
 * (cobblemon-assistant -> pokemon-assistant) would otherwise start everyone on
 * an empty PC / team store. On first launch under the new name we copy the old
 * folder across (DB, sprite cache, renderer localStorage). The old folder is
 * left untouched, so this is safe to re-run and easy to roll back.
 *
 * Must run before the app `ready` event, while nothing in the profile is open.
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const LEGACY_NAMES = ['cobblemon-assistant', 'Cobblemon Assistant'];
const MARKER = 'rivals-assistant.sqlite';

export function migrateLegacyUserData(): void {
  try {
    const current = app.getPath('userData');
    if (fs.existsSync(path.join(current, MARKER))) return;

    const appData = app.getPath('appData');
    for (const name of LEGACY_NAMES) {
      const legacy = path.join(appData, name);
      if (legacy === current || !fs.existsSync(path.join(legacy, MARKER))) continue;
      fs.cpSync(legacy, current, { recursive: true, force: false, errorOnExist: false });
      console.log(`[userData] migrated ${legacy} -> ${current}`);
      return;
    }
  } catch (err) {
    console.error('[userData] legacy migration failed', err);
  }
}
