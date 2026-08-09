#!/usr/bin/env node
// Build a normalized-name -> PokeAPI sprite id map for alternate forms.
//
// The renderer resolves sprites from the PokeAPI mirror by National Dex number
// (see src/renderer/src/lib/pokemonSprite.ts). Every alternate form shares its
// base species' dex (all six Rotom appliances are #0479), so without this map
// they all render the base sprite. PokeAPI gives form-specific sprites their
// own numeric ids (Heat Rotom = 10008, …); this script discovers those ids by
// matching our species names against PokeAPI's pokemon list.
//
// Only forms whose resolved id differs from the dex number are written, so base
// species keep using their plain dex sprite. Forms PokeAPI doesn't distinguish
// (Arceus plates, Silvally memories, gender-only forms, …) are simply omitted
// and fall back to the base sprite - the same behavior as today.
//
// Output: src/renderer/src/lib/formSprites.json   (network; re-runnable)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POKEMON_JSON = path.resolve(__dirname, '..', 'src/renderer/public/data/pokemon.json');
const OUT_JSON = path.resolve(__dirname, '..', 'src/renderer/src/lib/formSprites.json');
const POKEAPI_LIST = 'https://pokeapi.co/api/v2/pokemon?limit=20000';

// Match the normalizer in pokemonSprite.ts exactly.
export const normName = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\./g, '')
    .replace(/:/g, '')
    .replace(/é/g, 'e')
    .replace(/%/g, '')
    .replace(/\s+/g, '-');

const res = await fetch(POKEAPI_LIST);
if (!res.ok) {
  console.error(`Failed to fetch PokeAPI list: ${res.status}`);
  process.exit(1);
}
const { results } = await res.json();
const nameToId = new Map();
for (const r of results) {
  const m = r.url.match(/\/(\d+)\/?$/);
  if (m) nameToId.set(r.name, Number(m[1]));
}

const pokemon = JSON.parse(fs.readFileSync(POKEMON_JSON, 'utf8'));
const map = {};
let forms = 0;
for (const p of pokemon) {
  const id = nameToId.get(normName(p.name));
  // Only override when PokeAPI gives this form its own sprite id distinct from
  // the dex number; otherwise the existing dex-based URL is already correct.
  if (id != null && id !== p.dex) {
    map[normName(p.name)] = id;
    forms++;
  }
}

const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(OUT_JSON, JSON.stringify(sorted, null, 2) + '\n');
console.log(`Wrote ${forms} form sprite ids to ${path.relative(process.cwd(), OUT_JSON)}`);
