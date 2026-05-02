#!/usr/bin/env node
/**
 * Mock Cobblemon mod client.
 *
 * Connects to the Assistant's local WebSocket bridge and streams a scripted
 * battle scenario. Useful for end-to-end-testing the mod integration without
 * needing a running Minecraft client.
 *
 * Usage:
 *   1. In the Assistant, open Battle Session -> click "Start listener".
 *   2. In another terminal: `node scripts/mod-mock-client.mjs`.
 *   3. Watch the battle state populate live.
 *
 * Optional flags:
 *   --url=ws://127.0.0.1:8788/cobblemon   override the target URL
 *   --pace=400                            ms between frames (default 750)
 *   --scenario=ohko                       scenario id (default 'standard')
 */

import WebSocket from 'ws';

const PROTOCOL_VERSION = 1;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  }),
);
const URL = args.url ?? 'ws://127.0.0.1:8788/cobblemon';
const PACE = Number(args.pace ?? 750);
const SCENARIO = args.scenario ?? 'standard';
const BATTLE_ID = `mock-${Math.random().toString(36).slice(2, 10)}`;

let seq = 0;

function event(payload) {
  return {
    type: 'event',
    protocolVersion: PROTOCOL_VERSION,
    seq: ++seq,
    timestamp: Date.now(),
    battleId: BATTLE_ID,
    payload,
  };
}

const SCENARIOS = {
  standard: () => [
    {
      kind: 'pokemon-revealed',
      side: 'player',
      slot: 0,
      species: 'Garchomp',
      level: 50,
      gender: 'M',
      shiny: false,
      knownSet: {
        nature: 'Jolly',
        ability: 'Rough Skin',
        item: 'Choice Scarf',
        teraType: 'Ground',
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
        moves: [
          { name: 'Earthquake', ppCurrent: 16, ppMax: 16 },
          { name: 'Outrage', ppCurrent: 16, ppMax: 16 },
          { name: 'Stone Edge', ppCurrent: 8, ppMax: 8 },
          { name: 'Iron Head', ppCurrent: 24, ppMax: 24 },
        ],
      },
    },
    {
      kind: 'pokemon-revealed',
      side: 'opponent',
      slot: 0,
      species: 'Tatsugiri',
      level: 50,
      gender: 'F',
      shiny: false,
      hpPercent: 100,
    },
    { kind: 'battle-started', format: 'singles', startingActive: { player: 0, opponent: 0 } },
    { kind: 'turn-started', turn: 1 },
    { kind: 'move-used', side: 'player', slot: 0, move: 'Earthquake', consumePP: true },
    {
      kind: 'damage-taken',
      target: { side: 'opponent', slot: 0 },
      amount: 200,
      cause: 'Earthquake',
      source: { side: 'player', slot: 0 },
    },
    { kind: 'fainted', target: { side: 'opponent', slot: 0 } },
    { kind: 'battle-ended', winner: 'player' },
  ],

  ohko: () => [
    {
      kind: 'pokemon-revealed',
      side: 'player',
      slot: 0,
      species: 'Garchomp',
      level: 50,
      gender: 'M',
      shiny: false,
      knownSet: {
        nature: 'Adamant',
        ability: 'Rough Skin',
        item: 'Choice Band',
        teraType: 'Ground',
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        evs: { hp: 0, atk: 252, def: 0, spa: 0, spd: 4, spe: 252 },
        moves: [{ name: 'Earthquake', ppCurrent: 16, ppMax: 16 }],
      },
    },
    {
      kind: 'pokemon-revealed',
      side: 'opponent',
      slot: 0,
      species: 'Pikachu',
      level: 50,
      gender: 'N',
      shiny: false,
      hpPercent: 100,
    },
    { kind: 'battle-started', format: 'singles', startingActive: { player: 0, opponent: 0 } },
    { kind: 'turn-started', turn: 1 },
    { kind: 'move-used', side: 'player', slot: 0, move: 'Earthquake', consumePP: true },
    {
      kind: 'damage-taken',
      target: { side: 'opponent', slot: 0 },
      amount: 999,
      cause: 'Earthquake',
      source: { side: 'player', slot: 0 },
    },
    { kind: 'fainted', target: { side: 'opponent', slot: 0 } },
    { kind: 'battle-ended', winner: 'player' },
  ],
};

const script = SCENARIOS[SCENARIO];
if (!script) {
  console.error(`Unknown scenario "${SCENARIO}". Available: ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(1);
}

const frames = script();

const ws = new WebSocket(URL);

ws.on('open', () => {
  console.log(`mock-client → connected to ${URL}`);
  ws.send(
    JSON.stringify({
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      modId: 'cobblemon-assistant-mock-client',
      cobblemonVersion: '1.6.0',
      minecraftVersion: '1.20.1',
      playerUUID: '00000000-0000-0000-0000-000000000001',
    }),
  );
  (async () => {
    for (const f of frames) {
      await new Promise((r) => setTimeout(r, PACE));
      const env = event(f);
      ws.send(JSON.stringify(env));
      console.log(`  → frame#${env.seq} ${f.kind}`);
    }
    await new Promise((r) => setTimeout(r, PACE));
    ws.close(1000, 'done');
  })().catch((e) => {
    console.error(e);
    ws.close(1011, 'error');
  });
});

ws.on('close', (code, reason) => {
  console.log(`mock-client ← closed (${code}) ${reason?.toString() ?? ''}`);
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('mock-client error:', e.message);
  process.exit(1);
});
