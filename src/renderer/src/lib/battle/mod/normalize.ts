/**
 * Wire-event -> internal-event normalizer.
 *
 * Takes a `ModEvent` (from the Cobblemon companion mod) and emits zero or
 * more `BattleEvent`s that the existing reducer + predictor consume. Some
 * mod events map 1:1 (e.g. `move-used` -> `MoveUsed`); others fan out
 * (`pokemon-revealed` may carry a known set, which becomes a `PokemonRevealed`
 * followed by inferred ability/item reveals).
 *
 * The normalizer is **pure**: it doesn't mutate state, doesn't query the
 * predictor, and doesn't access the file system. Tests stub the input and
 * compare the emitted event list.
 *
 * Unknown / unmapped events return `[]` rather than throwing - newer mod
 * versions may add events that older engines silently ignore.
 */

import type { BattleEvent } from '../events';
import { makeId, makePokemon, type BattlePokemon, type BattleState } from '../state';
import type { ModBattleEventMessage, ModEvent } from './protocol';
import type { Pokemon } from '../../types';

export interface NormalizeContext {
  /** Lookup species by name (e.g. "Garchomp" -> `Pokemon` from `pokemon.json`). */
  pokemonByName: Record<string, Pokemon>;
  /**
   * Read access to the current `BattleState`. We need this for ID lookups -
   * e.g. translating `{ side: 'opponent', slot: 0 }` -> `'o:0'`, or resolving
   * the actor of a `move-used` event when slot is implicit.
   */
  state: BattleState;
}

/**
 * Translate one wire-frame envelope into 0..N internal events.
 *
 * Returns an array because some wire events fan out:
 *   - `pokemon-revealed` with a `knownSet` produces 1× `PokemonRevealed` +
 *     1× `AbilityRevealed` + 1× `ItemRevealed`.
 *   - `hp-updated` produces a `Damaged` (if HP fell) or `Healed` (if HP rose).
 */
export function normalize(envelope: ModBattleEventMessage, ctx: NormalizeContext): BattleEvent[] {
  return normalizeEvent(envelope.payload, ctx);
}

export function normalizeEvent(event: ModEvent, ctx: NormalizeContext): BattleEvent[] {
  switch (event.kind) {
    case 'battle-started':
      return [{ type: 'BattleStarted', startingActive: event.startingActive }];
    case 'battle-ended':
      return [{ type: 'BattleEnded', winner: event.winner ?? null }];
    case 'turn-started':
      return [{ type: 'TurnStarted', turn: event.turn }];
    case 'pokemon-revealed': {
      const species = ctx.pokemonByName[event.species.toLowerCase()];
      if (!species) return [];
      const pokemon = buildBattlePokemon(species, event, ctx);
      const out: BattleEvent[] = [
        { type: 'PokemonRevealed', side: event.side, slot: event.slot, pokemon },
      ];
      // If the mod revealed a known set, lock the ability/item explicitly so
      // the predictor narrows immediately.
      if (event.knownSet?.ability) {
        out.push({ type: 'AbilityRevealed', target: pokemon.id, ability: event.knownSet.ability });
      }
      if (event.knownSet?.item) {
        out.push({ type: 'ItemRevealed', target: pokemon.id, item: event.knownSet.item });
      }
      return out;
    }
    case 'switched':
      return [{ type: 'Switched', side: event.side, toSlot: event.toSlot }];
    case 'move-used': {
      const id = makeId(event.side, event.slot);
      return [{ type: 'MoveUsed', actor: id, move: event.move, consumePP: event.consumePP }];
    }
    case 'damage-taken': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'Damaged', target: targetId, amount: event.amount, cause: event.cause }];
    }
    case 'hp-updated': {
      const targetId = makeId(event.target.side, event.target.slot);
      // Compare against the current state to derive a delta.
      const team = ctx.state.sides[event.target.side].team;
      const slot = team[event.target.slot];
      const prevHP = slot ? slot.battle.currentHP : event.maxHP;
      const delta = event.currentHP - prevHP;
      if (delta === 0) return [];
      if (delta < 0) return [{ type: 'Damaged', target: targetId, amount: -delta, cause: 'hp-update' }];
      return [{ type: 'Healed', target: targetId, amount: delta, cause: 'hp-update' }];
    }
    case 'healed': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'Healed', target: targetId, amount: event.amount, cause: event.cause }];
    }
    case 'status-applied': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'StatusApplied', target: targetId, status: event.status }];
    }
    case 'status-cured': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'StatusCured', target: targetId }];
    }
    case 'boost-changed': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'BoostChanged', target: targetId, stat: event.stat, delta: event.delta }];
    }
    case 'weather-changed':
      // Engine uses '' for "no weather", wire uses null.
      return [{ type: 'WeatherChanged', weather: event.weather ?? '', turns: event.turns }];
    case 'terrain-changed':
      return [{ type: 'TerrainChanged', terrain: event.terrain ?? '', turns: event.turns }];
    case 'hazard-set':
      return [{ type: 'HazardSet', side: event.side, hazard: event.hazard }];
    case 'hazard-cleared':
      return [{ type: 'HazardCleared', side: event.side }];
    case 'screen-set':
      return [{ type: 'ScreenSet', side: event.side, screen: event.screen, turns: event.turns }];
    case 'screen-cleared':
      return [{ type: 'ScreenCleared', side: event.side, screen: event.screen }];
    case 'tailwind-set':
      return [{ type: 'TailwindSet', side: event.side, turns: event.turns }];
    case 'ability-revealed': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'AbilityRevealed', target: targetId, ability: event.ability }];
    }
    case 'item-revealed': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'ItemRevealed', target: targetId, item: event.item }];
    }
    case 'item-consumed': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'ItemConsumed', target: targetId }];
    }
    case 'terastallized': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'Terastallized', target: targetId, teraType: event.teraType }];
    }
    case 'fainted': {
      const targetId = makeId(event.target.side, event.target.slot);
      return [{ type: 'Fainted', target: targetId }];
    }
    default: {
      // The TS exhaustiveness check should make `event` never here. If a new
      // ModEvent variant is added without updating this switch, leave the line
      // below to compile-fail in the future. For now we accept the unknown by
      // emitting nothing.
      const _exhaustive: never = event;
      void _exhaustive;
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBattlePokemon(
  species: Pokemon,
  event: Extract<ModEvent, { kind: 'pokemon-revealed' }>,
  ctx: NormalizeContext,
): BattlePokemon {
  const knownSet = event.knownSet;
  const isOpponent = event.side === 'opponent';
  const pkmn = makePokemon(
    species,
    {
      speciesName: species.name,
      level: event.level,
      nature: knownSet?.nature ?? 'Hardy',
      ability: knownSet?.ability ?? '',
      item: knownSet?.item ?? '',
      teraType: knownSet?.teraType ?? '',
      ivs: knownSet?.ivs ?? { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: knownSet?.evs ?? { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
      moves: knownSet?.moves?.map((m) => ({ name: m.name })) ?? [],
    },
    makeId(event.side, event.slot),
    { isOpponent, source: isOpponent ? 'INFERRED' : 'KNOWN' },
  );
  if (event.currentHP != null && event.maxHP != null) {
    pkmn.battle.currentHP = Math.max(0, Math.min(event.currentHP, event.maxHP));
    pkmn.battle.maxHP = event.maxHP;
  } else if (event.hpPercent != null) {
    pkmn.battle.currentHP = Math.max(1, Math.round((pkmn.battle.maxHP * event.hpPercent) / 100));
  }
  void ctx;
  return pkmn;
}

// ---------------------------------------------------------------------------
// Test-only re-exports
// ---------------------------------------------------------------------------

export const __test_only__ = { buildBattlePokemon };

// Side type re-export so test fixtures don't import from protocol again.
export type { ModSide } from './protocol';
