#!/usr/bin/env node
// Build per-format usage bundles from the pkmn/smogon mirror on GitHub:
//   data/stats/<format>.json   monthly Smogon usage stats (public domain)
//   data/sets/<format>.json    Smogon's curated sets (move lists and spreads only)
//
// Species are keyed by Showdown id and limited to the species dex.json lists
// for the format, so run build-dex first.
//
// Output: src/renderer/public/data/usage/<format>.json
// Usage:  node scripts/fetch-usage.mjs [--format gen9ou]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toID } from '@pkmn/sim';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/renderer/public/data');
const MIRROR = 'https://raw.githubusercontent.com/pkmn/smogon/main/data';

const LABELS = { gen9ou: 'Gen 9 OU', gen9nationaldex: 'NatDex OU' };
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const args = process.argv.slice(2);
const only = args.includes('--format') ? args[args.indexOf('--format') + 1] : null;

const dex = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dex.json'), 'utf8'));
const formats = only ? [only] : dex.formats;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const pct = (fraction) => Math.round(fraction * 1000) / 10;
const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function top(obj, limit) {
  return Object.entries(obj ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function parseSpread(key) {
  // "Jolly:0/252/0/0/4/252" -> { nature, evs: [hp, atk, def, spa, spd, spe] }
  const [nature, evStr] = key.split(':');
  return { nature, evs: (evStr ?? '').split('/').map((n) => Number(n) || 0) };
}

function evsToArray(evs) {
  if (Array.isArray(evs)) evs = evs[0];
  return STAT_ORDER.map((k) => Number(evs?.[k]) || 0);
}

// Sets list only the IVs that differ from a perfect 31.
function ivsToArray(ivs) {
  if (Array.isArray(ivs)) ivs = ivs[0];
  return STAT_ORDER.map((k) => (ivs?.[k] == null ? 31 : Number(ivs[k])));
}

function curatedSets(raw) {
  const sets = {};
  for (const [setName, s] of Object.entries(raw ?? {})) {
    const tera = s.teratypes ?? s.teraType;
    sets[setName] = {
      moves: (s.moves ?? []).map(asArray),
      item: asArray(s.item),
      ability: asArray(s.ability)[0] ?? null,
      nature: asArray(s.nature)[0] ?? null,
      evs: evsToArray(s.evs),
      ...(s.ivs ? { ivs: ivsToArray(s.ivs) } : {}),
      ...(tera ? { teraType: asArray(tera)[0] } : {}),
    };
  }
  return sets;
}

async function buildFormat(format) {
  const inFormat = new Map(
    dex.species.filter((s) => s.formats[format]).map((s) => [s.id, s]),
  );
  const [stats, setsByName] = await Promise.all([
    fetchJson(`${MIRROR}/stats/${format}.json`),
    fetchJson(`${MIRROR}/sets/${format}.json`),
  ]);
  const sets = new Map(Object.entries(setsByName).map(([name, v]) => [toID(name), v]));
  const known = (name) => inFormat.get(toID(name));

  const entries = Object.entries(stats.pokemon)
    .filter(([name]) => known(name))
    .sort((a, b) => b[1].usage.weighted - a[1].usage.weighted);

  const species = {};
  entries.forEach(([name, d], i) => {
    const sp = known(name);
    const teammates = top(d.teammates, 40)
      .filter(([n]) => known(n))
      .slice(0, 10)
      .map(([n, f]) => ({ id: known(n).id, name: known(n).name, pct: pct(f) }));
    const checks = Object.entries(d.counters ?? {})
      .filter(([n, [count]]) => count >= 100 && known(n))
      .sort((a, b) => b[1][1] - a[1][1])
      .slice(0, 6)
      .map(([n, [, p]]) => ({ id: known(n).id, name: known(n).name, score: Math.round(p * 100) / 100 }));
    const curated = curatedSets(sets.get(sp.id));

    species[sp.id] = {
      name: sp.name,
      usage: Math.round(d.usage.weighted * 10000) / 10000,
      rank: i + 1,
      abilities: top(d.abilities, 3).map(([n, f]) => ({ name: n, pct: pct(f) })),
      items: top(d.items, 6).map(([n, f]) => ({ name: n === 'Nothing' || n === '' ? 'No item' : n, pct: pct(f) })),
      spreads: top(d.spreads, 4).map(([key, f]) => ({ ...parseSpread(key), pct: pct(f) })),
      moves: top(d.moves, 11)
        .filter(([n]) => n !== 'Nothing' && n !== '')
        .slice(0, 10)
        .map(([n, f]) => ({ name: n, pct: pct(f) })),
      teraTypes: top(d.teraTypes, 5)
        .filter(([n]) => n !== 'Nothing')
        .slice(0, 4)
        .map(([n, f]) => ({ name: n, pct: pct(f) })),
      teammates,
      checks,
      ...(Object.keys(curated).length ? { sets: curated } : {}),
    };
  });

  const bundle = {
    meta: {
      format,
      label: LABELS[format] ?? format,
      source: 'pkmn/smogon',
      battles: stats.battles,
      fetchedAt: new Date().toISOString(),
    },
    species,
  };
  const out = path.join(DATA_DIR, 'usage', `${format}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bundle));
  const withSets = Object.values(species).filter((s) => s.sets).length;
  console.log(
    `${format}: ${entries.length}/${Object.keys(stats.pokemon).length} ladder species, ${withSets} with sets, ` +
      `${Math.round(fs.statSync(out).size / 1024)} KB -> ${path.relative(ROOT, out)}`,
  );
}

for (const f of formats) await buildFormat(f);
