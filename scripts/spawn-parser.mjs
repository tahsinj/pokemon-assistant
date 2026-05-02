#!/usr/bin/env node
/**
 * Cobblemon spawn datapack -> assistant `spawns.json` helper (v0).
 *
 * Usage:
 *   node scripts/spawn-parser.mjs <path-to-folder-of-spawn-json>
 *
 * Expects Cobblemon-style spawn definition JSON files (one species / pool per file or merged - adjust `extractEntries`
 * when you point this at real Rivals datapack paths). Writes merged output next to this script for inspection:
 *   cobblemon-assistant/scripts/_spawn-merge-out.json
 *
 * Next step: paste a sample Cobblemon spawn JSON path and extend `extractEntries` to map fields to SpawnEntry.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walkJsonFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walkJsonFiles(p, acc);
    else if (name.endsWith('.json')) acc.push(p);
  }
  return acc;
}

/** Override: map one datapack JSON object into assistant spawn rows. */
function extractEntries(_filePath, data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray(data.spawns)) return data.spawns;
  if (data && typeof data === 'object' && data.pokemon) {
    return [
      {
        bucket: data.bucket,
        biomes: data.biomes || data.conditions?.biomes || [],
        presets: data.presets || [],
        weight: data.weight,
        timeRange: data.conditions?.timeRange,
        isRaining: data.conditions?.isRaining,
        isThundering: data.conditions?.isThundering,
      },
    ];
  }
  return [data];
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: node scripts/spawn-parser.mjs <folder-of-json>');
    console.error('Example (after you clone datapack): node scripts/spawn-parser.mjs ./rivals-datapack/data/cobblemon/spawn_pool_world/');
    process.exit(1);
  }
  const files = walkJsonFiles(path.resolve(dir));
  const bySpecies = {};
  let total = 0;
  for (const f of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      console.warn('Skip (invalid JSON):', f, e.message);
      continue;
    }
    const base = path.basename(f, '.json');
    const speciesId = (data && data.id) || base.replace(/^spawn_/, '');
    const rows = extractEntries(f, data);
    if (!bySpecies[speciesId]) bySpecies[speciesId] = [];
    for (const row of rows) {
      bySpecies[speciesId].push({ _source: path.relative(process.cwd(), f), ...row });
      total++;
    }
  }
  const out = path.join(__dirname, '_spawn-merge-out.json');
  fs.writeFileSync(out, JSON.stringify(bySpecies, null, 2));
  console.log(`Wrote ${total} rows across ${Object.keys(bySpecies).length} keys → ${out}`);
}

main();
