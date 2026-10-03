/**
 * Cobblemon mod <-> Assistant wire protocol.
 *
 * Shared module: imported by both the Electron main process (which runs the
 * WebSocket listener) and the renderer (which normalizes payloads into the
 * engine's internal `BattleEvent`s). Therefore this file MUST stay free of
 * Node-only or DOM-only imports - pure types + a runtime validator.
 *
 * The companion Minecraft mod connects to the Assistant's local WebSocket
 * server (default `ws://127.0.0.1:8788/cobblemon`) and posts JSON messages
 * shaped as `ModEvent`. The Assistant normalizes these into internal
 * `BattleEvent`s and routes them through the existing reducer + predictor.
 *
 * The protocol is **append-only** - every event represents an observable
 * thing that happened in the live battle. The Assistant is responsible for
 * deriving derived state (boosts, hazards, predictions); the mod only reports
 * raw observations.
 *
 * Versioning: every message carries a `protocolVersion` integer. The current
 * version is 1. Incrementing changes the on-the-wire format and the
 * Assistant must reject messages with an unknown version.
 */

export const PROTOCOL_VERSION = 1;

/** Default WS listen address; matches the companion mod's default config. */
export const DEFAULT_PROTOCOL_PORT = 8788;
export const DEFAULT_PROTOCOL_PATH = '/cobblemon';

// ---------------------------------------------------------------------------
// Shared literal-type aliases (mirror the engine's internal types, but live
// here so the protocol stays self-contained).
// ---------------------------------------------------------------------------

export type ModSide = 'player' | 'opponent';

export type ModStatus = 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz';

export type ModStatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva';

export type ModWeather =
  | 'Sun'
  | 'Rain'
  | 'Sand'
  | 'Snow'
  | 'Hail'
  | 'Harsh Sunshine'
  | 'Heavy Rain'
  | 'Strong Winds'
  | null;

export type ModTerrain = 'Electric' | 'Grassy' | 'Misty' | 'Psychic' | null;

export interface ModBaseStats {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface ModTargetRef {
  side: ModSide;
  slot: number;
}

// ---------------------------------------------------------------------------
// Top-level messages (discriminated union)
// ---------------------------------------------------------------------------

export type ModMessage =
  | ModHelloMessage
  | ModBattleEventMessage
  | ModConnectionStatusMessage
  | ModErrorMessage;

/** Initial handshake from the mod. Sent immediately after connect. */
export interface ModHelloMessage {
  type: 'hello';
  protocolVersion: number;
  /** Mod-side build identifier, e.g. "pokemon-assistant-mod-0.3.1". */
  modId: string;
  /** Cobblemon version the mod is running against. */
  cobblemonVersion: string;
  /** Minecraft version. */
  minecraftVersion: string;
  /** Local player's UUID, used to identify which side is "ours". */
  playerUUID: string;
}

/**
 * Connection liveness / heartbeat. Either side may emit. The Assistant uses
 * `heartbeat` to detect stale links; the mod uses `disconnected` to signal
 * a battle ended / mod is unloading.
 */
export interface ModConnectionStatusMessage {
  type: 'status';
  protocolVersion: number;
  status: 'connected' | 'disconnected' | 'heartbeat';
  timestamp: number;
}

/** Error report. Either side can emit. The Assistant logs and surfaces. */
export interface ModErrorMessage {
  type: 'error';
  protocolVersion: number;
  code: string;
  message: string;
}

/**
 * The bulk message: a battle event. Each one wraps a `payload` of one of
 * many `ModEvent` types described below.
 */
export interface ModBattleEventMessage {
  type: 'event';
  protocolVersion: number;
  /** Monotonically increasing per-battle sequence number for dedup. */
  seq: number;
  /** Wall clock when the event was observed (ms since epoch). */
  timestamp: number;
  /** Unique battle identifier (Cobblemon's BattleId UUID). */
  battleId: string;
  payload: ModEvent;
}

// ---------------------------------------------------------------------------
// Event payloads
// ---------------------------------------------------------------------------

export type ModEvent =
  | ModBattleStartedEvent
  | ModBattleEndedEvent
  | ModTurnStartedEvent
  | ModPokemonRevealedEvent
  | ModSwitchedEvent
  | ModMoveUsedEvent
  | ModDamageTakenEvent
  | ModHpUpdatedEvent
  | ModHealedEvent
  | ModStatusAppliedEvent
  | ModStatusCuredEvent
  | ModBoostChangedEvent
  | ModWeatherChangedEvent
  | ModTerrainChangedEvent
  | ModHazardSetEvent
  | ModHazardClearedEvent
  | ModScreenSetEvent
  | ModScreenClearedEvent
  | ModTailwindSetEvent
  | ModAbilityRevealedEvent
  | ModItemRevealedEvent
  | ModItemConsumedEvent
  | ModTerastallizedEvent
  | ModFaintedEvent;

interface ModEventBase {
  kind: ModEvent['kind'];
}

export interface ModBattleStartedEvent extends ModEventBase {
  kind: 'battle-started';
  /** Cobblemon battle type - used for format hints (single, double, multi). */
  format: string;
  startingActive: { player: number; opponent: number };
}

export interface ModBattleEndedEvent extends ModEventBase {
  kind: 'battle-ended';
  winner: ModSide | null;
}

export interface ModTurnStartedEvent extends ModEventBase {
  kind: 'turn-started';
  turn: number;
}

/**
 * Always sent the first time a Pokémon appears (on start, on switch-in, or on
 * reveal of an opponent's full team via certain moves).
 */
export interface ModPokemonRevealedEvent extends ModEventBase {
  kind: 'pokemon-revealed';
  side: ModSide;
  slot: number;
  species: string;
  level: number;
  gender: 'M' | 'F' | 'N';
  shiny: boolean;
  /** Optional: when the mod can resolve full data for *our* Pokémon. */
  knownSet?: {
    nature: string;
    ability: string;
    item: string | null;
    teraType: string | null;
    ivs: ModBaseStats;
    evs: ModBaseStats;
    moves: { name: string; ppCurrent: number; ppMax: number }[];
  };
  /** Current HP at reveal time (mod knows ours exactly; opponent is a %). */
  currentHP?: number;
  maxHP?: number;
  hpPercent?: number;
}

export interface ModSwitchedEvent extends ModEventBase {
  kind: 'switched';
  side: ModSide;
  fromSlot: number;
  toSlot: number;
}

export interface ModMoveUsedEvent extends ModEventBase {
  kind: 'move-used';
  side: ModSide;
  slot: number;
  move: string;
  /** Always-true unless the mod is replaying / testing. */
  consumePP: boolean;
}

/**
 * Damage taken. The mod observes the HP delta directly from the game; the
 * Assistant doesn't need to recompute. Use this in preference to relying on
 * `hp-updated` since it carries the cause.
 */
export interface ModDamageTakenEvent extends ModEventBase {
  kind: 'damage-taken';
  target: ModTargetRef;
  amount: number;
  /** "Earthquake", "Stealth Rock", "Burn", "Recoil", "Sandstorm", etc. */
  cause: string;
  /** Source attacker, if from a move. */
  source?: ModTargetRef;
}

/**
 * Direct HP overwrite - useful for cases where damage source is unknown.
 * Prefer `damage-taken` / `healed` when the cause is observable.
 */
export interface ModHpUpdatedEvent extends ModEventBase {
  kind: 'hp-updated';
  target: ModTargetRef;
  currentHP: number;
  maxHP: number;
}

export interface ModHealedEvent extends ModEventBase {
  kind: 'healed';
  target: ModTargetRef;
  amount: number;
  cause: string;
}

export interface ModStatusAppliedEvent extends ModEventBase {
  kind: 'status-applied';
  target: ModTargetRef;
  status: ModStatus;
}

export interface ModStatusCuredEvent extends ModEventBase {
  kind: 'status-cured';
  target: ModTargetRef;
}

export interface ModBoostChangedEvent extends ModEventBase {
  kind: 'boost-changed';
  target: ModTargetRef;
  stat: ModStatKey;
  delta: number;
}

export interface ModWeatherChangedEvent extends ModEventBase {
  kind: 'weather-changed';
  weather: ModWeather;
  turns?: number;
}

export interface ModTerrainChangedEvent extends ModEventBase {
  kind: 'terrain-changed';
  terrain: ModTerrain;
  turns?: number;
}

export interface ModHazardSetEvent extends ModEventBase {
  kind: 'hazard-set';
  side: ModSide;
  hazard: 'stealthRock' | 'spikes' | 'toxicSpikes' | 'stickyWeb' | 'steelsurge';
}

export interface ModHazardClearedEvent extends ModEventBase {
  kind: 'hazard-cleared';
  /** When omitted, clear hazards on both sides. */
  side?: ModSide;
}

export interface ModScreenSetEvent extends ModEventBase {
  kind: 'screen-set';
  side: ModSide;
  screen: 'reflect' | 'lightScreen' | 'auroraVeil';
  turns: number;
}

export interface ModScreenClearedEvent extends ModEventBase {
  kind: 'screen-cleared';
  side: ModSide;
  screen: 'reflect' | 'lightScreen' | 'auroraVeil';
}

export interface ModTailwindSetEvent extends ModEventBase {
  kind: 'tailwind-set';
  side: ModSide;
  turns: number;
}

export interface ModAbilityRevealedEvent extends ModEventBase {
  kind: 'ability-revealed';
  target: ModTargetRef;
  ability: string;
}

export interface ModItemRevealedEvent extends ModEventBase {
  kind: 'item-revealed';
  target: ModTargetRef;
  item: string;
}

export interface ModItemConsumedEvent extends ModEventBase {
  kind: 'item-consumed';
  target: ModTargetRef;
}

export interface ModTerastallizedEvent extends ModEventBase {
  kind: 'terastallized';
  target: ModTargetRef;
  teraType: string;
}

export interface ModFaintedEvent extends ModEventBase {
  kind: 'fainted';
  target: ModTargetRef;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Quick runtime guard. Returns null when the input is a well-formed message
 * of the current protocol version, otherwise a string explaining what's
 * wrong. The Electron listener uses this to gate every incoming frame
 * before forwarding to the renderer.
 *
 * The check is shallow on purpose: it verifies the discriminator field,
 * version, and presence of required keys, but does not enforce every payload
 * subfield. The downstream normalizer is forgiving (returns `[]` for things
 * it can't make sense of) so a strict validation here would just block
 * forward compatibility.
 */
export function validateMessage(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return 'message is not an object';
  const m = input as Partial<ModMessage>;
  if (typeof m.type !== 'string') return 'missing message.type';
  if (typeof m.protocolVersion !== 'number') return 'missing message.protocolVersion';
  if (m.protocolVersion !== PROTOCOL_VERSION) {
    return `protocolVersion ${m.protocolVersion} not supported (engine speaks v${PROTOCOL_VERSION})`;
  }
  switch (m.type) {
    case 'hello':
    case 'status':
    case 'error':
      return null;
    case 'event': {
      const e = m as Partial<ModBattleEventMessage>;
      if (typeof e.seq !== 'number') return 'event missing seq';
      if (typeof e.battleId !== 'string') return 'event missing battleId';
      if (!e.payload || typeof (e.payload as ModEvent).kind !== 'string') return 'event missing payload.kind';
      return null;
    }
    default:
      return `unknown message.type: ${m.type as string}`;
  }
}

/**
 * Build a connection URL the mod can dial. Keeps the host/port/path in one
 * place so both ends agree.
 */
export function buildWebSocketURL(host = '127.0.0.1', port = DEFAULT_PROTOCOL_PORT, path = DEFAULT_PROTOCOL_PATH): string {
  return `ws://${host}:${port}${path.startsWith('/') ? path : `/${path}`}`;
}
