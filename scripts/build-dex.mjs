#!/usr/bin/env node
// Build the species, move and item data the app loads, from Pokemon Showdown's
// own data (@pkmn/sim). EV yields and form sprite ids come from PokeAPI's CSV
// dumps (BSD-3, see README).
//
// One file covers every supported format. Each species lists the formats it
// appears in, with its tier there and whether the format bans it. Each learnset
// entry says how the move is learned in Gen 9, or "legacy" when only an older
// generation teaches it (National Dex allows those, Gen 9 OU does not).
//
// Output:
//   src/renderer/public/data/dex.json
//   src/renderer/src/lib/formSprites.json
//
// Usage: node scripts/build-dex.mjs   (needs network for the PokeAPI CSVs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Dex, toID } from '@pkmn/sim';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DEX = path.join(ROOT, 'src/renderer/public/data/dex.json');
const OUT_SPRITES = path.join(ROOT, 'src/renderer/src/lib/formSprites.json');
const POKEAPI_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

export const FORMATS = [
  { id: 'gen9ou', natdex: false },
  { id: 'gen9nationaldex', natdex: true },
];

// Nonstandard values a National Dex format still allows.
const NATDEX_NONSTANDARD = new Set(['Past', 'Unobtainable']);

// Same normalizer as pokemonSprite.ts / sprites.ts: PokeAPI identifiers are
// lowercase, hyphenated display names.
export const normName = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\./g, '')
    .replace(/:/g, '')
    .replace(/é/g, 'e')
    .replace(/%/g, '')
    .replace(/\s+/g, '-');

// Showdown names whose PokeAPI identifier is spelled differently.
const POKEAPI_ALIASES = {
  'indeedee-f': 'indeedee-female',
  'meowstic-f': 'meowstic-female',
  'basculegion-f': 'basculegion-female',
  'oinkologne-f': 'oinkologne-female',
  'necrozma-dusk-mane': 'necrozma-dusk',
  'necrozma-dawn-wings': 'necrozma-dawn',
  'ogerpon-wellspring': 'ogerpon-wellspring-mask',
  'ogerpon-hearthflame': 'ogerpon-hearthflame-mask',
  'ogerpon-cornerstone': 'ogerpon-cornerstone-mask',
  'ogerpon-wellspring-tera': 'ogerpon-wellspring-mask',
  'ogerpon-hearthflame-tera': 'ogerpon-hearthflame-mask',
  'ogerpon-cornerstone-tera': 'ogerpon-cornerstone-mask',
  'zygarde-10': 'zygarde-10-power-construct',
  'tauros-paldea-combat': 'tauros-paldea-combat-breed',
  'tauros-paldea-blaze': 'tauros-paldea-blaze-breed',
  'tauros-paldea-aqua': 'tauros-paldea-aqua-breed',
  'maushold-four': 'maushold-family-of-four',
  'squawkabilly-blue': 'squawkabilly-blue-plumage',
  'squawkabilly-yellow': 'squawkabilly-yellow-plumage',
  'squawkabilly-white': 'squawkabilly-white-plumage',
  'minior-meteor': 'minior-red-meteor',
  'darmanitan-galar': 'darmanitan-galar-standard',
  'greninja-bond': 'greninja-battle-bond',
  'rockruff-dusk': 'rockruff-own-tempo',
  'pikachu-original': 'pikachu-original-cap',
  'pikachu-hoenn': 'pikachu-hoenn-cap',
  'pikachu-sinnoh': 'pikachu-sinnoh-cap',
  'pikachu-unova': 'pikachu-unova-cap',
  'pikachu-kalos': 'pikachu-kalos-cap',
  'pikachu-alola': 'pikachu-alola-cap',
  'pikachu-partner': 'pikachu-partner-cap',
  'pikachu-world': 'pikachu-world-cap',
};

const STAT_IDS = { 1: 'hp', 2: 'atk', 3: 'def', 4: 'spa', 5: 'spd', 6: 'spe' };

const TAG_LABELS = {
  'Restricted Legendary': 'restricted',
  'Sub-Legendary': 'legendary',
  Mythical: 'mythical',
  Paradox: 'paradox',
  'Ultra Beast': 'ultra_beast',
};

async function fetchCsv(name) {
  const r = await fetch(`${POKEAPI_CSV}/${name}`);
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  const [header, ...rows] = (await r.text()).trim().split('\n');
  const keys = header.split(',');
  return rows.map((line) => Object.fromEntries(line.split(',').map((v, i) => [keys[i], v])));
}

function inFormat(species, format) {
  if (!species.exists || species.num <= 0 || species.isCosmeticForme) return false;
  const ns = species.isNonstandard;
  if (ns && !(format.natdex && NATDEX_NONSTANDARD.has(ns))) return false;
  const tier = format.natdex ? species.natDexTier : species.tier;
  return !!tier && tier !== 'Illegal';
}

function learnMethod(sources) {
  const gen9 = sources.filter((s) => s.startsWith('9'));
  if (!gen9.length) return 'legacy';
  const levels = gen9.filter((s) => s[1] === 'L').map((s) => Number(s.slice(2)));
  if (levels.length) return String(Math.max(1, Math.min(...levels)));
  if (gen9.some((s) => s[1] === 'M')) return 'tm';
  if (gen9.some((s) => s[1] === 'T')) return 'tutor';
  if (gen9.some((s) => s[1] === 'E')) return 'egg';
  return 'event';
}

function buildMoves() {
  const out = {};
  for (const m of Dex.moves.all()) {
    if (m.isZ || m.isMax) continue;
    if (m.isNonstandard && !NATDEX_NONSTANDARD.has(m.isNonstandard)) continue;
    out[m.id] = {
      id: m.id,
      name: m.name,
      type: m.type.toLowerCase(),
      category: m.category,
      power: m.basePower,
      accuracy: m.accuracy,
      pp: m.pp,
      priority: m.priority,
      desc: m.shortDesc || m.desc,
      target: m.target,
      flags: Object.keys(m.flags).filter((f) => m.flags[f]),
      ...(m.isNonstandard ? { past: true } : {}),
    };
  }
  return out;
}

function itemCategory(it) {
  if (it.megaStone) return 'mega';
  if (it.isBerry) return 'berry';
  if (it.zMove || it.isGem || it.onMemory || it.onDrive) return 'other';
  if (it.onPlate) return 'plate';
  return 'held';
}

function buildItems() {
  return Dex.items
    .all()
    .filter((it) => !it.isPokeball)
    .filter((it) => !it.isNonstandard || NATDEX_NONSTANDARD.has(it.isNonstandard))
    .map((it) => ({
      id: it.id,
      name: it.name,
      category: itemCategory(it),
      ...(it.isNonstandard ? { past: true } : {}),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function maleRatio(species) {
  if (species.gender === 'N') return -1;
  if (species.gender === 'M') return 1;
  if (species.gender === 'F') return 0;
  return species.genderRatio.M;
}

function buildLearnset(species, moves) {
  const sources = new Map();
  for (const { learnset } of Dex.species.getFullLearnset(species.id)) {
    for (const [move, list] of Object.entries(learnset)) {
      if (!moves[move]) continue;
      if (!sources.has(move)) sources.set(move, []);
      sources.get(move).push(...list);
    }
  }
  return [...sources.entries()]
    .map(([move, list]) => ({ learn: learnMethod(list), move }))
    .sort((a, b) => a.move.localeCompare(b.move));
}

async function main() {
  const [pokeapiMons, pokeapiStats] = await Promise.all([
    fetchCsv('pokemon.csv'),
    fetchCsv('pokemon_stats.csv'),
  ]);
  const pokeapiIdByName = new Map(pokeapiMons.map((r) => [r.identifier, Number(r.id)]));
  const effortById = new Map();
  for (const r of pokeapiStats) {
    const id = Number(r.pokemon_id);
    if (!effortById.has(id)) effortById.set(id, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    effortById.get(id)[STAT_IDS[r.stat_id]] = Number(r.effort);
  }
  const pokeapiId = (species) => {
    const key = normName(species.name);
    return pokeapiIdByName.get(POKEAPI_ALIASES[key] ?? key);
  };

  const moves = buildMoves();
  const items = buildItems();
  const ruleTables = Object.fromEntries(
    FORMATS.map((f) => [f.id, Dex.formats.getRuleTable(Dex.formats.get(f.id))]),
  );

  const species = [];
  const formSprites = {};
  const unmatchedForms = [];
  for (const s of Dex.species.all()) {
    const formats = {};
    for (const f of FORMATS) {
      if (!inFormat(s, f)) continue;
      formats[f.id] = {
        tier: f.natdex ? s.natDexTier : s.tier,
        banned: ruleTables[f.id].isBannedSpecies(s),
      };
    }
    if (!Object.keys(formats).length) continue;

    const apiId = pokeapiId(s);
    if (s.forme) {
      if (apiId != null && apiId !== s.num) formSprites[normName(s.name)] = apiId;
      else if (apiId == null) unmatchedForms.push(s.name);
    }
    const evYield = effortById.get(apiId ?? s.num) ?? effortById.get(s.num);

    species.push({
      id: s.id,
      name: s.name,
      dex: s.num,
      types: s.types.map((t) => t.toLowerCase()),
      abilities: [...new Set(Object.values(s.abilities).map(toID))],
      hiddenAbilities: s.abilities.H ? [toID(s.abilities.H)] : [],
      baseStats: { ...s.baseStats },
      ...(evYield ? { evYield } : {}),
      maleRatio: maleRatio(s),
      eggGroups: s.eggGroups.map((g) => g.toLowerCase().replace(/[ -]/g, '_')),
      height: Math.round(s.heightm * 10),
      weight: Math.round(s.weightkg * 10),
      labels: s.tags.map((t) => TAG_LABELS[t]).filter(Boolean),
      formats,
      moves: buildLearnset(s, moves),
    });
  }
  species.sort((a, b) => a.dex - b.dex || a.name.localeCompare(b.name));

  fs.writeFileSync(OUT_DEX, JSON.stringify({ formats: FORMATS.map((f) => f.id), species, moves, items }));
  const sortedSprites = Object.fromEntries(Object.entries(formSprites).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(OUT_SPRITES, JSON.stringify(sortedSprites, null, 2) + '\n');

  const kb = Math.round(fs.statSync(OUT_DEX).size / 1024);
  for (const f of FORMATS) {
    const inF = species.filter((s) => s.formats[f.id]);
    console.log(`${f.id}: ${inF.length} species, ${inF.filter((s) => s.formats[f.id].banned).length} banned`);
  }
  console.log(`Wrote ${path.relative(ROOT, OUT_DEX)} (${kb} KB): ${species.length} species, ${Object.keys(moves).length} moves, ${items.length} items`);
  console.log(`Wrote ${Object.keys(sortedSprites).length} form sprite ids; ${unmatchedForms.length} forms fall back to the base sprite`);
  if (process.argv.includes('--verbose')) console.log(unmatchedForms.join(', '));
}

await main();
