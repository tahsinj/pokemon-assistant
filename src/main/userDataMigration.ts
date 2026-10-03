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
  if (fs.existsSync(path.join(current, MARKER))) return null;
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
