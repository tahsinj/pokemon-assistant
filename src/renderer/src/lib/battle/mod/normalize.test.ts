import { describe, expect, it } from 'vitest';
import { emptyBattleState, makeId, makePokemon } from '../state';
import { applyEvent } from '../events';
import { normalize, normalizeEvent } from './normalize';
import {
  PROTOCOL_VERSION,
  buildWebSocketURL,
  validateMessage,
  type ModBattleEventMessage,
  type ModEvent,
} from './protocol';
import type { Pokemon } from '../../types';

const garchomp: Pokemon = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin', 'Sand Veil'],
  hiddenAbilities: ['Rough Skin'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: ['monster', 'dragon'],
  height: 19,
  weight: 950,
  labels: [],
  moves: [],
};

const tatsugiri: Pokemon = {
  id: 'tatsugiri',
  name: 'Tatsugiri',
  dex: 978,
  types: ['dragon', 'water'],
  abilities: ['Commander', 'Storm Drain'],
  hiddenAbilities: ['Storm Drain'],
  baseStats: { hp: 68, atk: 50, def: 60, spa: 120, spd: 95, spe: 82 },
  eggGroups: ['water2', 'dragon'],
  height: 3,
  weight: 80,
  labels: [],
  moves: [],
};

const pokemonByName: Record<string, Pokemon> = {
  garchomp,
  tatsugiri,
};

function makeEnvelope(payload: ModEvent, seq = 1): ModBattleEventMessage {
  return {
    type: 'event',
    protocolVersion: PROTOCOL_VERSION,
    seq,
    timestamp: Date.now(),
    battleId: 'b-test',
    payload,
  };
}

// ---------------------------------------------------------------------------
// validateMessage
// ---------------------------------------------------------------------------

describe('validateMessage', () => {
  it('accepts a well-formed event envelope', () => {
    const env = makeEnvelope({ kind: 'turn-started', turn: 3 });
    expect(validateMessage(env)).toBeNull();
  });

  it('rejects non-object input', () => {
    expect(validateMessage('hello')).toMatch(/not an object/);
    expect(validateMessage(null)).toMatch(/not an object/);
  });

  it('rejects unknown protocol version', () => {
    const env = { ...makeEnvelope({ kind: 'turn-started', turn: 1 }), protocolVersion: 999 };
    expect(validateMessage(env)).toMatch(/not supported/);
  });

  it('rejects event missing seq / battleId / payload.kind', () => {
    expect(
      validateMessage({ type: 'event', protocolVersion: PROTOCOL_VERSION, timestamp: 0, battleId: 'b', payload: {} }),
    ).toMatch(/seq/);
    expect(
      validateMessage({ type: 'event', protocolVersion: PROTOCOL_VERSION, seq: 1, timestamp: 0, payload: { kind: 'x' } }),
    ).toMatch(/battleId/);
    expect(
      validateMessage({ type: 'event', protocolVersion: PROTOCOL_VERSION, seq: 1, timestamp: 0, battleId: 'b', payload: {} }),
    ).toMatch(/payload.kind/);
  });

  it('accepts hello / status / error without further checks', () => {
    expect(
      validateMessage({
        type: 'hello',
        protocolVersion: PROTOCOL_VERSION,
        modId: 'm',
        cobblemonVersion: 'c',
        minecraftVersion: 'mc',
        playerUUID: 'u',
      }),
    ).toBeNull();
    expect(
      validateMessage({ type: 'status', protocolVersion: PROTOCOL_VERSION, status: 'heartbeat', timestamp: 0 }),
    ).toBeNull();
    expect(
      validateMessage({ type: 'error', protocolVersion: PROTOCOL_VERSION, code: 'x', message: 'y' }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildWebSocketURL
// ---------------------------------------------------------------------------

describe('buildWebSocketURL', () => {
  it('defaults to the documented local URL', () => {
    expect(buildWebSocketURL()).toBe('ws://127.0.0.1:8788/cobblemon');
  });
  it('respects overrides + adds leading slash if missing', () => {
    expect(buildWebSocketURL('0.0.0.0', 9001, 'foo')).toBe('ws://0.0.0.0:9001/foo');
  });
});

// ---------------------------------------------------------------------------
// normalize() - wire ModEvents -> BattleEvents
// ---------------------------------------------------------------------------

describe('normalize', () => {
  it('translates lifecycle events', () => {
    const state = emptyBattleState();
    expect(
      normalize(
        makeEnvelope({ kind: 'battle-started', format: 'singles', startingActive: { player: 0, opponent: 0 } }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } }]);

    expect(
      normalize(makeEnvelope({ kind: 'turn-started', turn: 5 }), { pokemonByName, state }),
    ).toEqual([{ type: 'TurnStarted', turn: 5 }]);

    expect(
      normalize(makeEnvelope({ kind: 'battle-ended', winner: 'player' }), { pokemonByName, state }),
    ).toEqual([{ type: 'BattleEnded', winner: 'player' }]);

    expect(
      normalize(makeEnvelope({ kind: 'battle-ended', winner: null }), { pokemonByName, state }),
    ).toEqual([{ type: 'BattleEnded', winner: null }]);
  });

  it('drops unknown species in pokemon-revealed instead of throwing', () => {
    const state = emptyBattleState();
    const out = normalize(
      makeEnvelope({
        kind: 'pokemon-revealed',
        side: 'opponent',
        slot: 0,
        species: 'NotARealMon',
        level: 50,
        gender: 'N',
        shiny: false,
      }),
      { pokemonByName, state },
    );
    expect(out).toEqual([]);
  });

  it('emits PokemonRevealed + AbilityRevealed + ItemRevealed when knownSet is present', () => {
    const state = emptyBattleState();
    const out = normalize(
      makeEnvelope({
        kind: 'pokemon-revealed',
        side: 'player',
        slot: 1,
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
          evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
          moves: [{ name: 'Earthquake', ppCurrent: 16, ppMax: 16 }],
        },
      }),
      { pokemonByName, state },
    );
    expect(out).toHaveLength(3);
    expect(out[0].type).toBe('PokemonRevealed');
    expect(out[1]).toEqual({ type: 'AbilityRevealed', target: 'p:1', ability: 'Rough Skin' });
    expect(out[2]).toEqual({ type: 'ItemRevealed', target: 'p:1', item: 'Choice Scarf' });
  });

  it('passes through HP overrides from the wire event', () => {
    const state = emptyBattleState();
    const out = normalize(
      makeEnvelope({
        kind: 'pokemon-revealed',
        side: 'opponent',
        slot: 0,
        species: 'Tatsugiri',
        level: 50,
        gender: 'F',
        shiny: false,
        hpPercent: 50,
      }),
      { pokemonByName, state },
    );
    const ev = out[0];
    if (ev.type !== 'PokemonRevealed') throw new Error('expected reveal');
    expect(ev.pokemon.battle.currentHP).toBeLessThan(ev.pokemon.battle.maxHP);
    expect(ev.pokemon.battle.currentHP).toBeGreaterThan(0);
  });

  it('emits Damaged on a move hit', () => {
    const state = emptyBattleState();
    const out = normalize(
      makeEnvelope({
        kind: 'damage-taken',
        target: { side: 'opponent', slot: 0 },
        amount: 120,
        cause: 'Earthquake',
        source: { side: 'player', slot: 0 },
      }),
      { pokemonByName, state },
    );
    expect(out).toEqual([
      { type: 'Damaged', target: 'o:0', amount: 120, cause: 'Earthquake' },
    ]);
  });

  it('hp-updated derives Damaged or Healed from delta', () => {
    // Seed a player Garchomp with currentHP=200 / maxHP=300.
    let state = emptyBattleState();
    const chomp = makePokemon(garchomp, { speciesName: 'Garchomp', level: 50 }, makeId('player', 0));
    chomp.battle.currentHP = 200;
    chomp.battle.maxHP = 300;
    state = applyEvent(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: chomp });

    const damaged = normalizeEvent(
      { kind: 'hp-updated', target: { side: 'player', slot: 0 }, currentHP: 150, maxHP: 300 },
      { pokemonByName, state },
    );
    expect(damaged).toEqual([{ type: 'Damaged', target: 'p:0', amount: 50, cause: 'hp-update' }]);

    const healed = normalizeEvent(
      { kind: 'hp-updated', target: { side: 'player', slot: 0 }, currentHP: 240, maxHP: 300 },
      { pokemonByName, state },
    );
    expect(healed).toEqual([{ type: 'Healed', target: 'p:0', amount: 40, cause: 'hp-update' }]);

    const noChange = normalizeEvent(
      { kind: 'hp-updated', target: { side: 'player', slot: 0 }, currentHP: 200, maxHP: 300 },
      { pokemonByName, state },
    );
    expect(noChange).toEqual([]);
  });

  it('converts wire weather null → engine empty-string', () => {
    const state = emptyBattleState();
    expect(
      normalize(makeEnvelope({ kind: 'weather-changed', weather: null }), { pokemonByName, state }),
    ).toEqual([{ type: 'WeatherChanged', weather: '', turns: undefined }]);
    expect(
      normalize(makeEnvelope({ kind: 'weather-changed', weather: 'Rain', turns: 5 }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'WeatherChanged', weather: 'Rain', turns: 5 }]);
  });

  it('round-trips a full reveal → apply → predictor-ready state', () => {
    let state = emptyBattleState();
    const events = normalize(
      makeEnvelope({
        kind: 'pokemon-revealed',
        side: 'opponent',
        slot: 0,
        species: 'Tatsugiri',
        level: 50,
        gender: 'F',
        shiny: false,
      }),
      { pokemonByName, state },
    );
    for (const ev of events) state = applyEvent(state, ev);
    const tat = state.sides.opponent.team[0];
    expect(tat?.identity.species).toBe('Tatsugiri');
    expect(tat?.identity.isOpponent).toBe(true);
    expect(tat?.battle.maxHP).toBeGreaterThan(0);
  });

  it('translates move-used + switched + status + boosts + fainted', () => {
    const state = emptyBattleState();
    expect(
      normalize(
        makeEnvelope({ kind: 'move-used', side: 'opponent', slot: 0, move: 'Hydro Pump', consumePP: true }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'MoveUsed', actor: 'o:0', move: 'Hydro Pump', consumePP: true }]);
    expect(
      normalize(makeEnvelope({ kind: 'switched', side: 'player', fromSlot: 0, toSlot: 2 }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'Switched', side: 'player', toSlot: 2 }]);
    expect(
      normalize(
        makeEnvelope({ kind: 'status-applied', target: { side: 'player', slot: 0 }, status: 'par' }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'StatusApplied', target: 'p:0', status: 'par' }]);
    expect(
      normalize(
        makeEnvelope({
          kind: 'boost-changed',
          target: { side: 'opponent', slot: 0 },
          stat: 'spa',
          delta: 2,
        }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'BoostChanged', target: 'o:0', stat: 'spa', delta: 2 }]);
    expect(
      normalize(makeEnvelope({ kind: 'fainted', target: { side: 'opponent', slot: 0 } }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'Fainted', target: 'o:0' }]);
  });

  it('translates field + hazards + screens + tailwind', () => {
    const state = emptyBattleState();
    expect(
      normalize(makeEnvelope({ kind: 'terrain-changed', terrain: 'Electric', turns: 5 }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'TerrainChanged', terrain: 'Electric', turns: 5 }]);
    expect(
      normalize(makeEnvelope({ kind: 'hazard-set', side: 'opponent', hazard: 'spikes' }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'HazardSet', side: 'opponent', hazard: 'spikes' }]);
    expect(
      normalize(makeEnvelope({ kind: 'hazard-cleared' }), { pokemonByName, state }),
    ).toEqual([{ type: 'HazardCleared', side: undefined }]);
    expect(
      normalize(
        makeEnvelope({ kind: 'screen-set', side: 'player', screen: 'reflect', turns: 5 }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'ScreenSet', side: 'player', screen: 'reflect', turns: 5 }]);
    expect(
      normalize(makeEnvelope({ kind: 'tailwind-set', side: 'opponent', turns: 4 }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'TailwindSet', side: 'opponent', turns: 4 }]);
  });

  it('translates Tera + ability/item reveal + consume', () => {
    const state = emptyBattleState();
    expect(
      normalize(
        makeEnvelope({ kind: 'terastallized', target: { side: 'opponent', slot: 0 }, teraType: 'Fairy' }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'Terastallized', target: 'o:0', teraType: 'Fairy' }]);
    expect(
      normalize(
        makeEnvelope({ kind: 'ability-revealed', target: { side: 'opponent', slot: 0 }, ability: 'Levitate' }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'AbilityRevealed', target: 'o:0', ability: 'Levitate' }]);
    expect(
      normalize(
        makeEnvelope({ kind: 'item-revealed', target: { side: 'opponent', slot: 0 }, item: 'Focus Sash' }),
        { pokemonByName, state },
      ),
    ).toEqual([{ type: 'ItemRevealed', target: 'o:0', item: 'Focus Sash' }]);
    expect(
      normalize(makeEnvelope({ kind: 'item-consumed', target: { side: 'opponent', slot: 0 } }), {
        pokemonByName,
        state,
      }),
    ).toEqual([{ type: 'ItemConsumed', target: 'o:0' }]);
  });
});
