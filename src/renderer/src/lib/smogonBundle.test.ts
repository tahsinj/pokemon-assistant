import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The shipped bundle must NOT carry verbatim Smogon analysis prose (set
// descriptions) - that is the one copyright-risky payload. This guard fails if
// the pipeline ever re-introduces it. See the 2026-06-13 design spec.
describe('shipped smogon.json', () => {
  const path = fileURLToPath(new URL('../../public/data/smogon.json', import.meta.url));
  const bundle = JSON.parse(readFileSync(path, 'utf8'));

  it('contains no set descriptions', () => {
    const offenders: string[] = [];
    for (const [id, sp] of Object.entries<any>(bundle.species)) {
      for (const [setName, set] of Object.entries<any>(sp.sets ?? {})) {
        if ('description' in set) offenders.push(`${id} / ${setName}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
