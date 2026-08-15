#!/usr/bin/env node
// Normalize Cobblemon species + spawn data and merge with Pokemon Showdown move data.
// Output: src/renderer/public/data/{pokemon,moves,spawns,items}.json
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.resolve(__dirname, '..', 'src/renderer/public/data');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SPECIES_ROOT = path.join(
  ROOT,
  'extracted/cobblemon-main-common-src-main-resources-data-cobblemon-species/common/src/main/resources/data/cobblemon/species',
);
const SPAWN_ROOT = path.join(
  ROOT,
  'extracted/cobblemon-main-common-src-main-resources-data-cobblemon-spawn_pool_world/common/src/main/resources/data/cobblemon/spawn_pool_world',
);
const PS_MOVES_PATH = path.join(ROOT, 'ps-moves.json');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

function toMoveId(raw) {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ---- Species ----
const pokemon = [];
const speciesFiles = fs.existsSync(SPECIES_ROOT) ? walk(SPECIES_ROOT) : [];
if (!speciesFiles.length) {
  console.warn('skip species: extracted Cobblemon species folder not found at', SPECIES_ROOT);
}
for (const f of speciesFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!data.implemented) continue;
    const moves = Array.isArray(data.moves)
      ? data.moves.map((m) => {
          const [lvlOrTag, name] = String(m).split(':');
          return { learn: lvlOrTag, move: toMoveId(name) };
        })
      : [];
    pokemon.push({
      id: String(data.name).toLowerCase(),
      name: data.name,
      dex: data.nationalPokedexNumber,
      types: [data.primaryType, data.secondaryType].filter(Boolean),
      abilities: (data.abilities || []).map((a) =>
        String(a).replace(/^h:/, ''),
      ),
      hiddenAbilities: (data.abilities || [])
        .filter((a) => String(a).startsWith('h:'))
        .map((a) => String(a).replace(/^h:/, '')),
      baseStats: {
        hp: data.baseStats?.hp ?? 0,
        atk: data.baseStats?.attack ?? 0,
        def: data.baseStats?.defence ?? 0,
        spa: data.baseStats?.special_attack ?? 0,
        spd: data.baseStats?.special_defence ?? 0,
        spe: data.baseStats?.speed ?? 0,
      },
      evYield: data.evYield,
      catchRate: data.catchRate,
      // Fraction of males 0..1; -1 = genderless (Cobblemon convention).
      maleRatio: typeof data.maleRatio === 'number' ? data.maleRatio : undefined,
      eggGroups: data.eggGroups || [],
      height: data.height,
      weight: data.weight,
      labels: data.labels || [],
      moves,
    });
  } catch (e) {
    console.error('species parse fail', f, e.message);
  }
}
pokemon.sort((a, b) => (a.dex ?? 9999) - (b.dex ?? 9999));
fs.writeFileSync(path.join(OUT_DIR, 'pokemon.json'), JSON.stringify(pokemon));
console.log(`wrote ${pokemon.length} species`);

// ---- Spawns ----
const spawnFiles = fs.existsSync(SPAWN_ROOT) ? walk(SPAWN_ROOT) : [];
if (!spawnFiles.length) {
  console.warn('skip spawns: extracted spawn folder not found at', SPAWN_ROOT);
}
// Map: pokemonId -> [{ bucket, level, weight, biomes, time, weather, light, preset }]
const spawnMap = {};
for (const f of spawnFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (data.enabled === false) continue;
    for (const s of data.spawns || []) {
      const key = toMoveId(s.pokemon).split(' ')[0];
      const entry = {
        bucket: s.bucket,
        level: s.level,
        weight: s.weight,
        biomes: s.condition?.biomes || [],
        moonPhase: s.condition?.moonPhase,
        canSeeSky: s.condition?.canSeeSky,
        minSkyLight: s.condition?.minSkyLight,
        maxSkyLight: s.condition?.maxSkyLight,
        timeRange: s.condition?.timeRange,
        isRaining: s.condition?.isRaining,
        isThundering: s.condition?.isThundering,
        structures: s.condition?.structures,
        presets: s.presets || [],
      };
      (spawnMap[key] ||= []).push(entry);
    }
  } catch (e) {
    console.error('spawn parse fail', f, e.message);
  }
}
fs.writeFileSync(path.join(OUT_DIR, 'spawns.json'), JSON.stringify(spawnMap));
console.log(`wrote spawn entries for ${Object.keys(spawnMap).length} species`);

// ---- Moves (from Pokemon Showdown) ----
if (!fs.existsSync(PS_MOVES_PATH)) {
  console.error('missing', PS_MOVES_PATH, '- download Showdown moves or keep public/data/moves.json');
  process.exit(1);
}
const rawMoves = JSON.parse(fs.readFileSync(PS_MOVES_PATH, 'utf8'));
// Moves any Cobblemon species can actually learn. Cobblemon revives some moves
// Showdown marks nonstandard (e.g. Pursuit is isNonstandard:'Past' since Gen 8),
// so we keep those rather than drop them along with truly removed content.
const referencedMoves = new Set();
for (const p of pokemon) for (const mv of p.moves) referencedMoves.add(mv.move);
const moves = {};
for (const [id, m] of Object.entries(rawMoves)) {
  if (m.isNonstandard && m.isNonstandard !== 'Unobtainable' && !referencedMoves.has(id)) continue;
  moves[id] = {
    id,
    name: m.name,
    type: (m.type || '').toLowerCase(),
    category: m.category,
    power: m.basePower,
    accuracy: m.accuracy,
    pp: m.pp,
    priority: m.priority,
    desc: m.shortDesc || m.desc || '',
    target: m.target,
    flags: m.flags ? Object.keys(m.flags) : [],
  };
}
fs.writeFileSync(path.join(OUT_DIR, 'moves.json'), JSON.stringify(moves));
console.log(`wrote ${Object.keys(moves).length} moves`);

// ---- Held items (Showdown battle items; Cobblemon Rivals battles use PS mechanics) ----
const SHOWDOWN_ITEMS_URL = 'https://play.pokemonshowdown.com/data/items.js';
const COBBLEMON_HELD_ITEMS_API =
  'https://gitlab.com/api/v4/projects/cable-mc%2Fcobblemon/repository/tree?path=common/src/main/resources/data/cobblemon/held_items&recursive=true&per_page=100';

function itemCategory(raw) {
  if (raw.megaStone || raw.megaStoneZ) return 'mega';
  if (raw.isBerry) return 'berry';
  if (raw.onPlate) return 'plate';
  if (raw.zMove || raw.onMemory || raw.onDrive) return 'other';
  if (raw.isChoice) return 'held';
  return 'held';
}

function isBattleHeldItem(m) {
  if (m.isPokeball) return false;
  const sd = m.shortDesc || m.desc || '';
  if (/^Evolves /.test(sd) && !/Holder|held|If held/i.test(sd)) return false;
  if (/^Can be revived/.test(sd)) return false;
  if (/^A (special )?Poke Ball/.test(sd)) return false;
  if (/^Used for Hyper Training/.test(sd)) return false;
  if (m.isNonstandard === 'Unobtainable') return false;
  return true;
}

async function fetchShowdownBattleItems() {
  const res = await fetch(SHOWDOWN_ITEMS_URL);
  if (!res.ok) throw new Error(`Showdown items fetch failed (${res.status})`);
  const text = await res.text();
  const sandbox = { exports: {} };
  vm.runInNewContext(text, sandbox);
  const raw = sandbox.exports.BattleItems ?? {};
  const out = [];
  for (const [id, m] of Object.entries(raw)) {
    if (!isBattleHeldItem(m)) continue;
    out.push({
      id,
      name: m.name,
      category: itemCategory(m),
      source: 'showdown',
    });
  }
  return out;
}

async function fetchCobblemonHeldItemNames() {
  const names = new Set();
  try {
    const res = await fetch(COBBLEMON_HELD_ITEMS_API);
    if (!res.ok) return names;
    const tree = await res.json();
    for (const entry of tree) {
      if (entry.type !== 'blob' || !entry.path.endsWith('.js')) continue;
      const rawUrl = `https://gitlab.com/cable-mc/cobblemon/-/raw/main/${entry.path}`;
      const fileRes = await fetch(rawUrl);
      if (!fileRes.ok) continue;
      const body = await fileRes.text();
      const nameMatch = body.match(/name:\s*"([^"]+)"/);
      if (nameMatch) names.add(nameMatch[1]);
    }
  } catch (e) {
    console.warn('Cobblemon held_items fetch skipped:', e.message);
  }
  return names;
}

async function writeItemsJson() {
  const byName = new Map();
  for (const item of await fetchShowdownBattleItems()) {
    byName.set(item.name.toLowerCase(), item);
  }
  for (const name of await fetchCobblemonHeldItemNames()) {
    const key = name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, { id: toMoveId(name), name, category: 'held', source: 'cobblemon' });
    }
  }
  const items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(items));
  console.log(`wrote ${items.length} held items (${items.filter((i) => i.source === 'cobblemon').length} Cobblemon-only)`);
}

await writeItemsJson();
