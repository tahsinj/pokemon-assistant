#!/usr/bin/env node
/**
 * Micro-benchmark for recommend() - measures end-to-end latency of the
 * search engine on a representative mid-battle state.
 *
 * Run with: node scripts/bench-recommend.mjs
 *
 * Uses tsx to load TypeScript modules from the renderer tree directly.
 */
import { spawnSync } from 'node:child_process';

// Use tsx to actually evaluate the TS modules.
const code = `
import { emptyBattleState, makeId, makePokemon } from './src/renderer/src/lib/battle/state.ts';
import { applyEvent } from './src/renderer/src/lib/battle/events.ts';
import { applyEventAndPredict } from './src/renderer/src/lib/battle/predictor/predictor.ts';
import { recommend } from './src/renderer/src/lib/battle/search/expectimax.ts';

const garchomp = {
  id: 'garchomp', name: 'Garchomp', dex: 445, types: ['dragon','ground'],
  abilities: ['Rough Skin','Sand Veil'], hiddenAbilities: ['Rough Skin'],
  baseStats: { hp:108, atk:130, def:95, spa:80, spd:85, spe:102 },
  eggGroups: ['monster','dragon'], height: 19, weight: 950, labels: [], moves: [],
};
const tatsugiri = {
  id: 'tatsugiri', name: 'Tatsugiri', dex: 978, types: ['dragon','water'],
  abilities: ['Commander','Storm Drain'], hiddenAbilities: ['Storm Drain'],
  baseStats: { hp:68, atk:50, def:60, spa:120, spd:95, spe:82 },
  eggGroups: ['water2','dragon'], height: 3, weight: 80, labels: [], moves: [],
};
const ironHands = {
  id: 'ironhands', name: 'Iron Hands', dex: 992, types: ['fighting','electric'],
  abilities: ['Quark Drive'], hiddenAbilities: ['Quark Drive'],
  baseStats: { hp:154, atk:140, def:108, spa:50, spd:68, spe:50 },
  eggGroups: [], height: 18, weight: 3807, labels: [], moves: [],
};

const pokemonByName = {
  garchomp, tatsugiri, 'iron hands': ironHands,
};
const moves = {};
const ctx = { pokemonByName, moves };

let s = emptyBattleState();
const chomp = makePokemon(garchomp, {
  speciesName:'Garchomp', level:50, nature:'Jolly', ability:'Rough Skin',
  item:'Choice Scarf', moves:[{name:'Earthquake'},{name:'Outrage'},{name:'Stone Edge'},{name:'Iron Head'}],
  evs:{atk:252, spe:252, spd:4},
}, makeId('player', 0), { isOpponent:false, source:'KNOWN' });
const hands = makePokemon(ironHands, {
  speciesName:'Iron Hands', level:50, nature:'Adamant', ability:'Quark Drive',
  item:'Booster Energy', moves:[{name:'Drain Punch'},{name:'Thunder Punch'},{name:'Wild Charge'},{name:'Ice Punch'}],
  evs:{hp:252, atk:252, spd:4},
}, makeId('player', 1), { isOpponent:false, source:'KNOWN' });
const tat = makePokemon(tatsugiri, {
  speciesName:'Tatsugiri', level:50, moves:[{name:'Draco Meteor'},{name:'Surf'},{name:'Muddy Water'},{name:'Nasty Plot'}],
}, makeId('opponent', 0), { isOpponent:true, source:'DEFAULT' });

s = applyEvent(s, { type:'PokemonRevealed', side:'player', slot:0, pokemon:chomp });
s = applyEvent(s, { type:'PokemonRevealed', side:'player', slot:1, pokemon:hands });
s = applyEventAndPredict(s, { type:'PokemonRevealed', side:'opponent', slot:0, pokemon:tat }, ctx);
s = applyEvent(s, { type:'BattleStarted', startingActive:{ player:0, opponent:0 } });

function bench(label, opts, n) {
  // Warmup
  for (let i=0; i<3; i++) recommend(s, ctx, opts);
  const t0 = performance.now();
  for (let i=0; i<n; i++) recommend(s, ctx, opts);
  const dt = performance.now() - t0;
  console.log(\`\${label.padEnd(38)} \${(dt/n).toFixed(1).padStart(7)} ms  (n=\${n})\`);
}

console.log('--- recommend() latency, single mid-battle state ---');
bench('depth=1, topK=1, no switches',   { depth:1, topKSets:1, includeSwitches:false }, 50);
bench('depth=1, topK=3, no switches',   { depth:1, topKSets:3, includeSwitches:false }, 50);
bench('depth=1, topK=3, with switches', { depth:1, topKSets:3, includeSwitches:true  }, 50);
bench('depth=2, topK=1, no switches',   { depth:2, topKSets:1, includeSwitches:false }, 30);
bench('depth=2, topK=3, no switches',   { depth:2, topKSets:3, includeSwitches:false }, 30);
bench('depth=2, topK=3, with switches', { depth:2, topKSets:3, includeSwitches:true  }, 20);
bench('depth=2, topK=5, with switches', { depth:2, topKSets:5, includeSwitches:true  }, 10);
`;

const res = spawnSync('npx', ['tsx', '--eval', code], {
  stdio: 'inherit',
  shell: false,
});
process.exit(res.status ?? 0);
