#!/usr/bin/env node
// Patch maleRatio into src/renderer/public/data/pokemon.json from Showdown's
// pokedex. Cobblemon's own species JSONs carry maleRatio too (fetch-data.mjs
// now passes it through), but the extracted mod source isn't always on disk -
// this script fills the field from Showdown for whatever is missing.
//
// Convention (matches Cobblemon): maleRatio = fraction of males 0..1,
// -1 = genderless.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POKEMON_JSON = path.resolve(__dirname, '..', 'src/renderer/public/data/pokemon.json');
const PS_DEX_URL = 'https://play.pokemonshowdown.com/data/pokedex.json';

const toId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function maleRatioFromShowdown(entry) {
  if (!entry) return null;
  if (entry.gender === 'N') return -1;
  if (entry.gender === 'M') return 1;
  if (entry.gender === 'F') return 0;
  if (entry.genderRatio && typeof entry.genderRatio.M === 'number') return entry.genderRatio.M;
  return 0.5; // Showdown default when unspecified
}

const res = await fetch(PS_DEX_URL);
if (!res.ok) {
  console.error(`Failed to fetch Showdown pokedex: ${res.status}`);
  process.exit(1);
}
const dex = await res.json();

// Index Showdown entries by id and by national dex number (base formes only).
const byId = new Map();
const byNum = new Map();
for (const [key, entry] of Object.entries(dex)) {
  byId.set(key, entry);
  if (typeof entry.num === 'number' && entry.num > 0 && !entry.forme) {
    if (!byNum.has(entry.num)) byNum.set(entry.num, entry);
  }
}

const pokemon = JSON.parse(fs.readFileSync(POKEMON_JSON, 'utf8'));
let patched = 0;
let missing = [];
for (const p of pokemon) {
  if (typeof p.maleRatio === 'number') continue; // already present (from Cobblemon data)
  const entry = byId.get(toId(p.name)) ?? byId.get(toId(p.id)) ?? byNum.get(p.dex);
  const ratio = maleRatioFromShowdown(entry);
  if (ratio === null) {
    missing.push(p.name);
    continue;
  }
  p.maleRatio = ratio;
  patched++;
}

fs.writeFileSync(POKEMON_JSON, JSON.stringify(pokemon));
console.log(`maleRatio patched for ${patched}/${pokemon.length} species.`);
if (missing.length) {
  console.warn(`No Showdown match for ${missing.length}: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? '…' : ''}`);
}
