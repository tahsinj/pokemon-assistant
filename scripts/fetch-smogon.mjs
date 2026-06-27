#!/usr/bin/env node
// Build src/renderer/public/data/smogon.json - NatDex OU competitive intel.
//
// Sources:
//   1. Usage chaos stats  https://www.smogon.com/stats/<YYYY-MM>/chaos/gen9nationaldex-1630.json
//   2. Curated dex sets   https://data.pkmn.cc/sets/gen9nationaldex.json
//
// The bundle is filtered to species present in pokemon.json (Cobblemon has no
// Megas / paradox mons / etc.), and teammate / check lists are filtered the
// same way. Chaos weights are normalized by each species' Raw count.
//
// Usage: node scripts/fetch-smogon.mjs [--format gen9nationaldex] [--cutoff 1630]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'src/renderer/public/data');
const OUT = path.join(DATA_DIR, 'smogon.json');

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const FORMAT = argOf('--format', 'gen9nationaldex');
const CUTOFF = argOf('--cutoff', '1630');
const FORMAT_LABEL = FORMAT === 'gen9nationaldex' ? 'NatDex OU' : FORMAT;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

// ── Local datasets ──────────────────────────────────────────────────────────
const pokemon = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pokemon.json'), 'utf8'));
const movesById = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'moves.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'items.json'), 'utf8'));

const speciesByNorm = new Map();
for (const p of pokemon) {
  speciesByNorm.set(norm(p.name), p);
  speciesByNorm.set(norm(p.id), p);
}
const moveNameById = new Map(Object.entries(movesById).map(([id, m]) => [id, m.name]));
const itemNameById = new Map(items.map((i) => [i.id, i.name]));

// Chaos keys abilities by id (e.g. "roughskin"); resolve display names from
// Showdown's ability table (a JS module - ability ids are exactly the
// normalized names, so harvesting every `name: "..."` field is sufficient).
const abilityNameById = new Map();
{
  const r = await fetch('https://play.pokemonshowdown.com/data/abilities.js');
  if (r.ok) {
    const js = await r.text();
    for (const m of js.matchAll(/name:\s*"([^"]+)"/g)) abilityNameById.set(norm(m[1]), m[1]);
  }
}

const titleCase = (id) =>
  String(id)
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
const moveName = (id) => moveNameById.get(id) ?? titleCase(id);
const itemName = (id) => itemNameById.get(id) ?? titleCase(id);
const abilityName = (id) => abilityNameById.get(norm(id)) ?? titleCase(id);

// ── Discover latest stats month ─────────────────────────────────────────────
async function findChaos() {
  const now = new Date();
  for (let back = 1; back <= 6; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const url = `https://www.smogon.com/stats/${month}/chaos/${FORMAT}-${CUTOFF}.json`;
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return { month, url };
  }
  throw new Error(`No ${FORMAT}-${CUTOFF} chaos file found in the last 6 months`);
}

const { month, url: chaosUrl } = await findChaos();
console.log(`Fetching ${chaosUrl} ...`);
const chaos = await fetchJson(chaosUrl);
console.log(`Fetching curated sets for ${FORMAT} ...`);
const setsData = await fetchJson(`https://data.pkmn.cc/sets/${FORMAT}.json`);

// ── Helpers ─────────────────────────────────────────────────────────────────
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function topEntries(obj, limit, mapFn) {
  return Object.entries(obj ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(mapFn);
}

const pct = (w, rawCount) => Math.round((w / rawCount) * 1000) / 10;

function parseSpread(key) {
  // "Jolly:0/252/0/0/4/252" -> { nature, evs: [hp,atk,def,spa,spd,spe] }
  const [nature, evStr] = key.split(':');
  const evs = (evStr ?? '').split('/').map((n) => Number(n) || 0);
  return { nature, evs };
}

function evsToArray(evObj) {
  if (Array.isArray(evObj)) evObj = evObj[0]; // pkmn sets allow spread lists
  return STAT_ORDER.map((k) => Number(evObj?.[k]) || 0);
}

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ── Build bundle ────────────────────────────────────────────────────────────
const chaosEntries = Object.entries(chaos.data);
const ranked = [...chaosEntries].sort((a, b) => b[1].usage - a[1].usage);
const rankByName = new Map(ranked.map(([name], i) => [name, i + 1]));

// Curated sets indexed by normalized species name.
const setsByNorm = new Map(Object.entries(setsData).map(([n, v]) => [norm(n), v]));

const species = {};
let matched = 0;
let withSets = 0;

for (const [name, d] of chaosEntries) {
  const p = speciesByNorm.get(norm(name));
  if (!p) continue;
  matched++;
  // Chaos weights are rating-weighted, so the right denominator is the
  // weighted population - the sum over Abilities (every mon has exactly one),
  // not Raw count.
  const rawCount =
    Object.values(d.Abilities ?? {}).reduce((a, b) => a + b, 0) || d['Raw count'] || 1;

  const teammates = topEntries(d.Teammates, 50, ([n, w]) => ({ n, w }))
    .map(({ n, w }) => {
      const tp = speciesByNorm.get(norm(n));
      return tp ? { id: tp.id, name: tp.name, pct: pct(w, rawCount) } : null;
    })
    .filter(Boolean)
    .slice(0, 10);

  const checks = Object.entries(d['Checks and Counters'] ?? {})
    .filter(([, v]) => v.n >= 100)
    .sort((a, b) => b[1].p - a[1].p)
    .map(([n, v]) => {
      const cp = speciesByNorm.get(norm(n));
      return cp ? { id: cp.id, name: cp.name, score: Math.round(v.p * 100) / 100 } : null;
    })
    .filter(Boolean)
    .slice(0, 6);

  const curated = setsByNorm.get(norm(name)) ?? {};
  const sets = {};
  for (const [setName, s] of Object.entries(curated)) {
    sets[setName] = {
      moves: (s.moves ?? []).map(asArray),
      item: asArray(s.item),
      ability: asArray(s.ability)[0] ?? null,
      nature: asArray(s.nature)[0] ?? null,
      evs: evsToArray(s.evs),
      ...(s.ivs ? { ivs: evsToArray(s.ivs) } : {}),
      ...(s.teratypes ?? s.teraType ? { teraType: asArray(s.teratypes ?? s.teraType)[0] } : {}),
    };
  }
  if (Object.keys(sets).length > 0) withSets++;

  species[p.id] = {
    name: p.name,
    usage: Math.round(d.usage * 10000) / 10000,
    rank: rankByName.get(name),
    abilities: topEntries(d.Abilities, 3, ([id, w]) => ({ name: abilityName(id), pct: pct(w, rawCount) })),
    items: topEntries(d.Items, 6, ([id, w]) => ({
      name: id === 'nothing' ? 'No item' : itemName(id),
      pct: pct(w, rawCount),
    })),
    spreads: topEntries(d.Spreads, 4, ([key, w]) => ({ ...parseSpread(key), pct: pct(w, rawCount) })),
    moves: topEntries(d.Moves, 10, ([id, w]) => ({ name: moveName(id), pct: pct(w, rawCount) })).filter(
      (m) => m.name !== 'Nothing',
    ),
    teraTypes: topEntries(d['Tera Types'], 5, ([id, w]) => ({ name: titleCase(id), pct: pct(w, rawCount) })).filter(
      (t) => t.name !== 'Nothing',
    ).slice(0, 4),
    teammates,
    checks,
    ...(Object.keys(sets).length > 0 ? { sets } : {}),
  };
}

const bundle = {
  meta: {
    format: FORMAT,
    label: FORMAT_LABEL,
    month,
    cutoff: Number(CUTOFF),
    battles: chaos.info['number of battles'],
    fetchedAt: new Date().toISOString(),
  },
  species,
};

fs.writeFileSync(OUT, JSON.stringify(bundle));
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(
  `Wrote ${OUT} (${kb} KB): ${matched}/${chaosEntries.length} ladder species matched to Cobblemon, ${withSets} with curated sets.`,
);
