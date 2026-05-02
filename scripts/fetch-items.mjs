#!/usr/bin/env node
/** Download battle held items -> src/renderer/public/data/items.json */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/renderer/public/data');
fs.mkdirSync(OUT_DIR, { recursive: true });

const SHOWDOWN_ITEMS_URL = 'https://play.pokemonshowdown.com/data/items.js';
const COBBLEMON_HELD_ITEMS_API =
  'https://gitlab.com/api/v4/projects/cable-mc%2Fcobblemon/repository/tree?path=common/src/main/resources/data/cobblemon/held_items&recursive=true&per_page=100';

function toId(raw) {
  return String(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}

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
    out.push({ id, name: m.name, category: itemCategory(m), source: 'showdown' });
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

const byName = new Map();
for (const item of await fetchShowdownBattleItems()) {
  byName.set(item.name.toLowerCase(), item);
}
for (const name of await fetchCobblemonHeldItemNames()) {
  const key = name.toLowerCase();
  if (!byName.has(key)) {
    byName.set(key, { id: toId(name), name, category: 'held', source: 'cobblemon' });
  }
}
const items = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path.join(OUT_DIR, 'items.json'), JSON.stringify(items));
console.log(`wrote ${items.length} held items to items.json`);
