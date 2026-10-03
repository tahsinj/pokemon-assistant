#!/usr/bin/env node
// Backfill National Dex species that the extracted Cobblemon source didn't
// implement (e.g. Kingambit, the Wurmple line, several legendaries) from
// Pokémon Showdown's public data, so they exist in the Pokédex / team builder /
// damage calc / Smogon panels like any other species.
//
// Source of truth stays Cobblemon: this only ADDS species whose id is absent
// from pokemon.json - it never overwrites an existing record. Re-runnable.
//
// Scope: one BASE species per missing national-dex number. Alternate formes
// (regional, Therian, Mega, Gmax, Urshifu-Rapid-Strike, ...) are skipped because
// sprites resolve by dex number and the dataset has no forme model - matching
// how the existing Cobblemon data is shaped.
//
// Run AFTER fetch-data, and re-run fetch-smogon afterwards so the new species
// pick up their competitive intel:  npm run fetch-missing-species && npm run fetch-smogon
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

// -- Local datasets ----------------------------------------------------------
const pokemon = JSON.parse(fs.readFileSync(POKEMON_JSON, 'utf8'));
const moves = JSON.parse(fs.readFileSync(path.join(DATA, 'moves.json'), 'utf8'));
const knownMoveIds = new Set(Object.keys(moves));
const haveIds = new Set(pokemon.map((p) => p.id));

console.log('Fetching Showdown pokedex + learnsets …');
const [dex, learnsets] = await Promise.all([fetchJson(PS_DEX), fetchJson(PS_LEARN)]);

// -- Helpers -----------------------------------------------------------------
const SKIP_NONSTANDARD = new Set(['CAP', 'Custom']);

function genFromDex(num) {
  const bounds = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  for (let i = 0; i < bounds.length; i++) if (num <= bounds[i]) return i + 1;
  return 9;
}

function maleRatio(entry) {
  if (entry.gender === 'N') return -1;
  if (entry.gender === 'M') return 1;
  if (entry.gender === 'F') return 0;
  if (entry.genderRatio && typeof entry.genderRatio.M === 'number') return entry.genderRatio.M;
  return 0.5;
}

function eggGroup(g) {
  return String(g).toLowerCase().replace(/[\s-]+/g, '_');
}

function abilities(entry) {
  const all = [];
  const hidden = [];
  for (const [slot, name] of Object.entries(entry.abilities || {})) {
    const id = toId(name);
    if (!all.includes(id)) all.push(id);
    if (slot === 'H' && !hidden.includes(id)) hidden.push(id);
  }
  return { abilities: all, hiddenAbilities: hidden };
}

// Collect a move->sources map merged up the evolution chain. Showdown stores a
// move only on the lowest evolution that learns it (Kingambit inherits Sucker
// Punch / Knock Off from Bisharp / Pawniard), so the full learnset requires
// walking `prevo`.
function mergedSources(entry) {
  const merged = {};
  let cur = entry;
  const seen = new Set();
  while (cur && !seen.has(cur.name)) {
    seen.add(cur.name);
    const ls = learnsets[toId(cur.name)]?.learnset;
    if (ls) {
      for (const [moveId, sources] of Object.entries(ls)) {
        (merged[moveId] ||= []).push(...sources);
      }
    }
    cur = cur.prevo ? dex[toId(cur.prevo)] : null;
  }
  return merged;
}

// Showdown learnset source codes: "<gen><src><level?>" e.g. 9L25, 9M, 9T, 9E.
// We emit one entry per source category (level keeps its number), filtered to
// moves present in moves.json. A move learnable both by level and TM appears
// twice - matching the existing {learn, move} shape the recommender relies on.
function learnsetFor(entry) {
  const out = [];
  for (const [moveId, sources] of Object.entries(mergedSources(entry))) {
    if (!knownMoveIds.has(moveId)) continue;
    let bestLevel = null; // highest-gen level-up level
    let bestLevelGen = -1;
    let tm = false;
    let tutor = false;
    let egg = false;
    for (const src of sources) {
      const m = /^(\d+)([A-Z])(\d*)$/.exec(src);
      if (!m) continue;
      const gen = Number(m[1]);
      const code = m[2];
      if (code === 'L') {
        if (gen > bestLevelGen) {
          bestLevelGen = gen;
          bestLevel = m[3] && m[3] !== '0' ? m[3] : '1';
        }
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

// -- Build records -----------------------------------------------------------
const added = [];
for (const entry of Object.values(dex)) {
  if (!entry.num || entry.num < 1) continue; // CAP / fakemon
  if (entry.baseSpecies) continue; // alternate forme
  if (entry.isNonstandard && SKIP_NONSTANDARD.has(entry.isNonstandard)) continue;
  const id = entry.name.toLowerCase();
  if (haveIds.has(id)) continue;

  const { abilities: abil, hiddenAbilities } = abilities(entry);
  added.push({
    id,
    name: entry.name,
    dex: entry.num,
    types: (entry.types || []).map((t) => t.toLowerCase()),
    abilities: abil,
    hiddenAbilities,
    baseStats: {
      hp: entry.baseStats?.hp ?? 0,
      atk: entry.baseStats?.atk ?? 0,
      def: entry.baseStats?.def ?? 0,
      spa: entry.baseStats?.spa ?? 0,
      spd: entry.baseStats?.spd ?? 0,
      spe: entry.baseStats?.spe ?? 0,
    },
    // evYield / catchRate aren't in Showdown's pokedex; both are optional and
    // unused (catchRate) or gracefully handled (evYield -> "none" in planner).
    maleRatio: maleRatio(entry),
    eggGroups: (entry.eggGroups || []).map(eggGroup),
    height: Math.round((entry.heightm ?? 0) * 10),
    weight: Math.round((entry.weightkg ?? 0) * 10),
    labels: [`gen${genFromDex(entry.num)}`],
    moves: learnsetFor(entry),
  });
}

pokemon.push(...added);
pokemon.sort((a, b) => (a.dex ?? 9999) - (b.dex ?? 9999));
fs.writeFileSync(POKEMON_JSON, JSON.stringify(pokemon));

const withMoves = added.filter((p) => p.moves.length).length;
console.log(
  `Added ${added.length} missing base species (${withMoves} with learnsets). pokemon.json now ${pokemon.length} total.`,
);
console.log('Sample:', added.slice(0, 8).map((p) => `${p.name} #${p.dex}`).join(', '));
console.log('→ Re-run `npm run fetch-smogon` so the new species get competitive intel.');
