#!/usr/bin/env node
// Backfill alternate battle FORMES (regional Alolan/Galarian/Hisuian/Paldean,
// Mega/Primal, Therian/Origin/Crowned/Urshifu/Ogerpon/Rotom appliances, …) from
// Pokémon Showdown's public data, so they exist in the Pokédex / team builder /
// counter-draft / damage calc like any other species. The base game (Cobblemon)
// ships only base formes, so without this you can't model an opponent running a
// Hisuian / Galarian / Mega Pokémon.
//
// Companion to fetch-missing-species.mjs (which adds only BASE species and
// deliberately skips formes). Only ADDS formes whose id is absent; never
// overwrites. Re-runnable.
//
// Cosmetic formes (same types AND base stats as the base species - Vivillon
// patterns, Toxtricity-Low-Key, Pikachu costumes, …) are skipped as noise.
// Gigantamax / Totem / CAP / Custom are skipped (Dynamax is a battle mechanic,
// not a species). Sprites resolve by national-dex number, so a forme shows its
// base species' art - accepted, like the rest of the dataset.
//
// Run AFTER fetch-data / fetch-missing-species, then re-run fetch-tiers and
// fetch-smogon so the new formes get tiers + competitive intel:
//   npm run fetch-formes && npm run fetch-tiers && npm run fetch-smogon
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', 'src/renderer/public/data');
const POKEMON_JSON = path.join(DATA, 'pokemon.json');

const PS_DEX = 'https://play.pokemonshowdown.com/data/pokedex.json';
const PS_LEARN = 'https://play.pokemonshowdown.com/data/learnsets.json';

const toId = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

const pokemon = JSON.parse(fs.readFileSync(POKEMON_JSON, 'utf8'));
const moves = JSON.parse(fs.readFileSync(path.join(DATA, 'moves.json'), 'utf8'));
const knownMoveIds = new Set(Object.keys(moves));
const haveIds = new Set(pokemon.map((p) => p.id));

console.log('Fetching Showdown pokedex + learnsets …');
const [dex, learnsets] = await Promise.all([fetchJson(PS_DEX), fetchJson(PS_LEARN)]);

// 'Future' = datamined / non-existent formes (Raichu-Mega-X), 'LGPE' = Let's Go
// partner Pikachu/Eevee, 'CAP'/'Custom' = fan content, 'Gigantamax' = a Dynamax
// state, not a species. All excluded; 'Past' (Megas, old regionals) is kept.
const SKIP_NONSTANDARD = new Set(['CAP', 'Custom', 'Gigantamax', 'Future', 'LGPE']);

function genFromDex(num) {
  const bounds = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  for (let i = 0; i < bounds.length; i++) if (num <= bounds[i]) return i + 1;
  return 9;
}
const maleRatio = (e) =>
  e.gender === 'N' ? -1 : e.gender === 'M' ? 1 : e.gender === 'F' ? 0
    : typeof e.genderRatio?.M === 'number' ? e.genderRatio.M : 0.5;
const eggGroup = (g) => String(g).toLowerCase().replace(/[\s-]+/g, '_');

function abilities(e) {
  const all = [];
  const hidden = [];
  for (const [slot, name] of Object.entries(e.abilities || {})) {
    const id = toId(name);
    if (!all.includes(id)) all.push(id);
    if (slot === 'H' && !hidden.includes(id)) hidden.push(id);
  }
  return { abilities: all, hiddenAbilities: hidden };
}

// Merge a species' learnset up the evolution chain (a forme's own entry first,
// then its prevo chain), so the forme has a usable movepool.
function mergedSources(entry) {
  const merged = {};
  let cur = entry;
  const seen = new Set();
  while (cur && !seen.has(cur.name)) {
    seen.add(cur.name);
    const ls = learnsets[toId(cur.name)]?.learnset;
    if (ls) for (const [moveId, src] of Object.entries(ls)) (merged[moveId] ||= []).push(...src);
    cur = cur.prevo ? dex[toId(cur.prevo)] : null;
  }
  return merged;
}

function learnsetFor(entry, baseEntry) {
  // A forme's own learnset entry is usually just its exclusive moves (Rotom-Heat
  // -> Overheat); the rest comes from the base species. Merge both.
  const sources = mergedSources(entry);
  if (baseEntry) {
    for (const [m, s] of Object.entries(mergedSources(baseEntry))) (sources[m] ||= []).push(...s);
  }
  const out = [];
  for (const [moveId, srcs] of Object.entries(sources)) {
    if (!knownMoveIds.has(moveId)) continue;
    let bestLevel = null;
    let bestGen = -1;
    let tm = false;
    let tutor = false;
    let egg = false;
    for (const s of srcs) {
      const m = /^(\d+)([A-Z])(\d*)$/.exec(s);
      if (!m) continue;
      const gen = Number(m[1]);
      const code = m[2];
      if (code === 'L') {
        if (gen > bestGen) { bestGen = gen; bestLevel = m[3] && m[3] !== '0' ? m[3] : '1'; }
      } else if (code === 'M') tm = true;
      else if (code === 'T') tutor = true;
      else if (code === 'E') egg = true;
    }
    if (bestLevel !== null) out.push({ learn: bestLevel, move: moveId });
    if (tm) out.push({ learn: 'tm', move: moveId });
    if (tutor) out.push({ learn: 'tutor', move: moveId });
    if (egg) out.push({ learn: 'egg', move: moveId });
  }
  return out;
}

const sameTypes = (a, b) =>
  a.length === b.length && a.map((t) => t.toLowerCase()).sort().join() === b.map((t) => t.toLowerCase()).sort().join();
const sameStats = (a, b) =>
  !!a && !!b && ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].every((k) => (a[k] ?? 0) === (b[k] ?? 0));

const added = [];
let cosmetic = 0;
for (const [, e] of Object.entries(dex)) {
  if (!e.baseSpecies || !e.num || e.num < 1) continue; // base species / fakemon
  if (e.isNonstandard && SKIP_NONSTANDARD.has(e.isNonstandard)) continue;
  if (/gmax|totem/i.test(e.forme || '')) continue;
  const id = toId(e.name);
  if (haveIds.has(id)) continue;

  const base = dex[toId(e.baseSpecies)];
  if (base && sameTypes(e.types || [], base.types || []) && sameStats(e.baseStats, base.baseStats)) {
    cosmetic++;
    continue; // cosmetic forme - no battle difference
  }

  const { abilities: abil, hiddenAbilities } = abilities(e);
  const region = /^(Alola|Galar|Hisui|Paldea)$/.exec(e.forme || '');
  added.push({
    id,
    name: e.name,
    dex: e.num,
    types: (e.types || []).map((t) => t.toLowerCase()),
    abilities: abil,
    hiddenAbilities,
    baseStats: {
      hp: e.baseStats?.hp ?? 0, atk: e.baseStats?.atk ?? 0, def: e.baseStats?.def ?? 0,
      spa: e.baseStats?.spa ?? 0, spd: e.baseStats?.spd ?? 0, spe: e.baseStats?.spe ?? 0,
    },
    maleRatio: maleRatio(e),
    eggGroups: (e.eggGroups || base?.eggGroups || []).map(eggGroup),
    height: Math.round((e.heightm ?? base?.heightm ?? 0) * 10),
    weight: Math.round((e.weightkg ?? base?.weightkg ?? 0) * 10),
    labels: [`gen${genFromDex(e.num)}`, 'form', ...(region ? [`${region[1].toLowerCase()}_form`] : [])],
    moves: learnsetFor(e, base),
  });
  haveIds.add(id);
}

pokemon.push(...added);
pokemon.sort((a, b) => (a.dex ?? 9999) - (b.dex ?? 9999) || a.name.localeCompare(b.name));
fs.writeFileSync(POKEMON_JSON, JSON.stringify(pokemon));

const withMoves = added.filter((p) => p.moves.length).length;
console.log(`Added ${added.length} battle formes (${withMoves} with learnsets), skipped ${cosmetic} cosmetic. pokemon.json now ${pokemon.length} total.`);
console.log('Sample:', added.slice(0, 12).map((p) => p.name).join(', '));
console.log('→ Re-run `npm run fetch-tiers` (forme tiers/bans) and `npm run fetch-smogon` (intel).');
