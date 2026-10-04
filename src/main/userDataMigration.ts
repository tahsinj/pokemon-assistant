import fs from 'node:fs';
import path from 'node:path';

// Every name the app has shipped under. Dev runs use the package name and
// installed builds the product name, so both spellings of each are listed.
export const LEGACY_NAMES = [
  'pokemon-assistant',
  'Pokemon Assistant',
  'cobblemon-assistant',
  'Cobblemon Assistant',
];

/** The database file name; its presence marks a folder as holding user data. */
export const DB_FILE = 'stab-lab.sqlite';
/** What the database was called before the rename; old folders only have this one. */
export const MARKER = 'rivals-assistant.sqlite';

/**
 * The old userData folder to carry over, or null when there is nothing to do.
 * Someone who ran several old builds can have more than one; the folder whose
 * database was written most recently wins.
 */
export function findLegacyUserData(
  appData: string,
  current: string,
  names: readonly string[] = LEGACY_NAMES,
): string | null {
  if (fs.existsSync(path.join(current, DB_FILE)) || fs.existsSync(path.join(current, MARKER))) return null;
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const name of names) {
    const dir = path.join(appData, name);
    if (dir === current) continue;
    const marker = path.join(dir, MARKER);
    if (!fs.existsSync(marker)) continue;
    const time = fs.statSync(marker).mtimeMs;
    if (time > bestTime) {
      best = dir;
      bestTime = time;
    }
  }
  return best;
}

/**
 * Give a database under the old file name the current one. Leaves an existing
 * new-name database alone. Returns true when it renamed something.
 */
export function renameLegacyDb(dir: string): boolean {
  const from = path.join(dir, MARKER);
  const to = path.join(dir, DB_FILE);
  if (!fs.existsSync(from) || fs.existsSync(to)) return false;
  fs.renameSync(from, to);
  return true;
}
