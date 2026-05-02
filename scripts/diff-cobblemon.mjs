#!/usr/bin/env node
// Cobblemon overrides audit script.
//
// Walks the emitted Cobblemon species dataset
// (`src/renderer/public/data/pokemon.json`) and compares each entry against
// @smogon/calc's baked-in Showdown SPECIES table for Gen 9. Emits a JSON
// manifest of divergences to:
//
//   src/renderer/public/data/cobblemon-divergences.json
//
// and prints a human-readable summary to stdout. Useful for:
//   - Spot-checking the auto-sync at app startup
//   - Generating a curated overrides file the user can hand-edit
//   - Diffing across mod versions ("did Cobblemon change Garchomp's BST?")
//
// Run with: node scripts/diff-cobblemon.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPECIES } from '@smogon/calc';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const POKEMON_JSON = path.join(ROOT, 'src/renderer/public/data/pokemon.json');
const OUT = path.join(ROOT, 'src/renderer/public/data/cobblemon-divergences.json');

if (!fs.existsSync(POKEMON_JSON)) {
  console.error(`Missing ${POKEMON_JSON} - run \`npm run fetch-data\` first.`);
  process.exit(2);
}

const pokemon = JSON.parse(fs.readFileSync(POKEMON_JSON, 'utf8'));

function normalizeId(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function lookupShowdown(name) {
  const id = normalizeId(name);
  // SPECIES is indexed by generation; walk down for cross-gen species.
  for (let g = SPECIES.length - 1; g >= 1; g--) {
    const tbl = SPECIES[g];
    if (!tbl) continue;
    for (const key of Object.keys(tbl)) {
      if (normalizeId(key) === id) {
        const d = tbl[key];
        const bs = d.bs;
        return {
          name: key,
          types: [...d.types],
          baseStats: {
            hp: bs.hp,
            atk: bs.at,
            def: bs.df,
            spa: bs.sa ?? bs.sl ?? bs.at,
            spd: bs.sd ?? bs.sl ?? bs.df,
            spe: bs.sp,
          },
          weightkg: d.weightkg,
          abilities: Object.values(d.abilities ?? {}),
        };
      }
    }
  }
  return null;
}

function sameTypeList(a, b) {
  if (a.length !== b.length) return false;
  const an = [...a].map((t) => t.toLowerCase()).sort();
  const bn = [...b].map((t) => t.toLowerCase()).sort();
  return an.every((v, i) => v === bn[i]);
}

function diffStats(a, b) {
  const out = {};
  let any = false;
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
    if (a[k] !== b[k]) {
      out[k] = { showdown: a[k], cobblemon: b[k] };
      any = true;
    }
  }
  return any ? out : null;
}

let processed = 0;
let divergent = 0;
const unmatched = [];
const divergences = [];

for (const cb of pokemon) {
  processed++;
  const sd = lookupShowdown(cb.name);
  if (!sd) {
    unmatched.push(cb.name);
    continue;
  }
  const div = {};
  let any = false;
  if (!sameTypeList(sd.types, cb.types)) {
    div.types = { showdown: sd.types, cobblemon: cb.types };
    any = true;
  }
  const stats = diffStats(sd.baseStats, cb.baseStats);
  if (stats) {
    div.baseStats = stats;
    any = true;
  }
  const cbWeightKg = cb.weight / 10;
  if (sd.weightkg && Math.abs(sd.weightkg - cbWeightKg) > 0.1) {
    div.weightkg = { showdown: sd.weightkg, cobblemon: cbWeightKg };
    any = true;
  }
  // Ability comparison intentionally suppressed: @smogon/calc's SPECIES table
  // only carries slot-0 abilities, so the naive set diff flags every species
  // with more than one ability slot. Use a real Showdown dex (@pkmn/dex) if
  // you want full ability auditing here.
  void sd.abilities;
  if (any) {
    divergent++;
    divergences.push({ name: cb.name, dex: cb.dex, divergence: div });
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  generation: 9,
  totals: { processed, divergent, unmatched: unmatched.length },
  divergences,
  unmatched,
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2));

console.log('--- Cobblemon × Showdown divergence audit ---');
console.log(`Processed: ${processed}`);
console.log(`Divergent: ${divergent}`);
console.log(`Unmatched (Cobblemon-only forms): ${unmatched.length}`);
console.log('');
console.log(`Wrote: ${path.relative(ROOT, OUT)}`);
if (divergent > 0) {
  console.log('');
  console.log('First 10 divergent species:');
  for (const d of divergences.slice(0, 10)) {
    const fields = Object.keys(d.divergence).join(', ');
    console.log(`  - ${d.name} (#${d.dex ?? '?'}): ${fields}`);
  }
}
