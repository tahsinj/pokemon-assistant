#!/usr/bin/env node
// Patch each species in pokemon.json with its NatDex competitive tier
// (`natDexTier`: "OU" | "UU" | … | "Uber" | "AG") from Pokémon Showdown's
// formats-data. Used to keep banned (Uber/AG) Pokémon off format-legal teams in
// the Best-6 builder. Re-runnable; run after fetch-data / fetch-missing-species.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POKEMON_JSON = path.resolve(__dirname, '..', 'src/renderer/public/data/pokemon.json');
const FORMATS_DATA = 'https://play.pokemonshowdown.com/data/formats-data.js';

const toId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const res = await fetch(FORMATS_DATA);
if (!res.ok) {
  console.error(`Failed to fetch formats-data: ${res.status}`);
  process.exit(1);
}
const js = await res.text();

// Parse `<id>:{ ... tier:"X" ... natDexTier:"Y" ... }` blocks out of the module.
const tierById = new Map();
for (const m of js.matchAll(/([a-z0-9]+):\{([^}]*)\}/g)) {
  const id = m[1];
  const body = m[2];
  const nd = /natDexTier:"([^"]*)"/.exec(body);
  const t = /tier:"([^"]*)"/.exec(body);
  // Prefer the NatDex tier; fall back to the standard SV tier when absent.
  const tier = nd?.[1] ?? t?.[1];
  if (tier) tierById.set(id, tier);
}

// Manual tier corrections. The upstream formats-data occasionally mislabels a
// species for our NatDex-OU purposes - e.g. Dragapult, a NatDex OU staple, has
// shown up as "Uber", which wrongly bans it from the Best-6 / suggestion pools.
// Keyed by `toId(name)`; applied on top of the fetched tiers.
const TIER_OVERRIDES = { dragapult: 'OU' };
for (const [id, tier] of Object.entries(TIER_OVERRIDES)) tierById.set(id, tier);

const pokemon = JSON.parse(fs.readFileSync(POKEMON_JSON, 'utf8'));
let patched = 0;
for (const p of pokemon) {
  const tier = tierById.get(toId(p.name));
  if (tier) {
    p.natDexTier = tier;
    patched++;
  } else {
    delete p.natDexTier;
  }
}
fs.writeFileSync(POKEMON_JSON, JSON.stringify(pokemon));
console.log(`Tagged ${patched}/${pokemon.length} species with a NatDex tier.`);
console.log(
  'Banned from NatDex OU (Uber/AG):',
  pokemon.filter((p) => p.natDexTier === 'Uber' || p.natDexTier === 'AG').length,
);
