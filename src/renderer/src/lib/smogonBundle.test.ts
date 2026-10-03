import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMAT_ORDER } from './formats';

// Smogon's analysis prose is copyrighted, so the shipped bundles carry move
// lists and spreads only. This fails if the pipeline ever brings set
// descriptions back.
describe.each(FORMAT_ORDER)('shipped usage/%s.json', (format) => {
  const path = fileURLToPath(new URL(`../../public/data/usage/${format}.json`, import.meta.url));
  const bundle = JSON.parse(readFileSync(path, 'utf8'));

  it('contains no set descriptions', () => {
    const offenders: string[] = [];
    const species = bundle.species as Record<string, { sets?: Record<string, object> }>;
    for (const [id, sp] of Object.entries(species)) {
      for (const [setName, set] of Object.entries(sp.sets ?? {})) {
        if ('description' in set) offenders.push(`${id} / ${setName}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
