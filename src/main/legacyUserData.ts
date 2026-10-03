/**
 * One-time carry-over of the per-user data folder from the app's old names.
 *
 * Electron derives `userData` from the app name, so a rename would otherwise
 * start everyone on an empty PC / team store. On first launch under the new
 * name we copy the old folder across (DB, sprite cache, renderer
 * localStorage). The old folder is left untouched, so this is safe to re-run
 * and easy to roll back.
 *
 * Must run before the app `ready` event, while nothing in the profile is open.
 */
import { app } from 'electron';
import fs from 'node:fs';
import { findLegacyUserData } from './userDataMigration';

export function migrateLegacyUserData(): void {
  try {
    const current = app.getPath('userData');
    const legacy = findLegacyUserData(app.getPath('appData'), current);
    if (!legacy) return;
    fs.cpSync(legacy, current, { recursive: true, force: false, errorOnExist: false });
    console.log(`[userData] migrated ${legacy} -> ${current}`);
  } catch (err) {
    console.error('[userData] legacy migration failed', err);
  }
}
