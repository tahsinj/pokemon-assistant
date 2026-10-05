/**
 * Calc inputs from a battle as one player sees it (@pkmn/client state). A
 * Pokémon's own set is used when the client has it (your side in practice);
 * otherwise a guessed set fills in what was never shown, and anything the
 * battle revealed (ability, item, Tera, moves) wins over the guess.
 */
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import type { BaseStats } from '../lib/types';
import {
  EMPTY_SIDE,
  NEUTRAL_EVS,
  NEUTRAL_IVS,
  type BattlePokemonSpec,
  type FieldSpec,
  type SideSpec,
} from '../lib/battle/types';
import type { ClientBattle } from './clientState';
import type { SideId } from './types';

/** The hidden part of a set. A predictor candidate fits this shape. */
export interface SetGuess {
  nature: string;
  ability: string;
  item: string | null;
  teraType: string | null;
  ivs: BaseStats;
  evs: BaseStats;
  moves: string[];
}

/** The spread assumed when nothing is known (what random battles use). */
const EVEN_EVS: BaseStats = { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 };

/**
 * Abilities whose stat change the calc applies on its own (Download,
 * Intimidate and so on). In a live battle that change already sits in the
 * Pokémon's boosts, so passing the ability would count it twice.
 */
const AUTO_BOOST_ABILITIES = new Set(['download', 'intimidate', 'intrepidsword', 'dauntlessshield', 'supersweetsyrup']);

const ITEM_GONE = new Set(['eaten', 'flung', 'knocked off', 'stolen', 'consumed', 'incinerated', 'popped']);

/** Items named by an effect ("item: Rocky Helmet") keep the prefix in the client's id. */
export const itemId = (id: string) => id.replace(/^item:\s*/, '');

/** The item it holds now, as far as this side knows; undefined when unknown. */
function heldItem(p: ClientPokemon, guess: string | null | undefined): string | undefined {
  if (p.item) return itemId(p.item);
  if (p.lastItem && ITEM_GONE.has(p.lastItemEffect)) return undefined;
  return guess ?? undefined;
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Without an ability the calc picks the species' first one, so name a neutral one instead. */
function calcAbility(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const id = toId(name);
  return AUTO_BOOST_ABILITIES.has(id) || id.startsWith('embodyaspect') ? 'No Ability' : name;
}

export function clientSpec(p: ClientPokemon, guess?: SetGuess): BattlePokemonSpec {
  const set = p.set;
  const revealedMoves = p.moveSlots.filter((m) => !m.virtual).map((m) => m.name as string);
  return {
    speciesName: p.speciesForme,
    level: p.level,
    nature: set?.nature || guess?.nature || 'Hardy',
    ability: calcAbility(p.ability || set?.ability || guess?.ability),
    item: set ? heldItem(p, set.item || null) : heldItem(p, guess?.item),
    teraType: p.terastallized ?? (set?.teraType || guess?.teraType || undefined),
    isTerastallized: !!p.terastallized,
    ivs: { ...NEUTRAL_IVS, ...(set?.ivs ?? guess?.ivs) },
    evs: set ? { ...NEUTRAL_EVS, ...set.evs } : { ...(guess?.evs ?? EVEN_EVS) },
    moves: (set?.moves ?? guess?.moves ?? revealedMoves).map((name) => ({ name })),
    currentHPPercent: p.maxhp ? (100 * p.hp) / p.maxhp : 100,
    boosts: { atk: p.boosts.atk, def: p.boosts.def, spa: p.boosts.spa, spd: p.boosts.spd, spe: p.boosts.spe },
    status: (p.status || undefined) as BattlePokemonSpec['status'],
  };
}

function sideSpec(battle: ClientBattle, side: SideId): SideSpec {
  const c = battle[side].sideConditions;
  return {
    ...EMPTY_SIDE,
    spikes: Math.min(3, c.spikes?.level ?? 0) as SideSpec['spikes'],
    steelsurge: !!c.gmaxsteelsurge,
    stealthRock: !!c.stealthrock,
    isReflect: !!c.reflect,
    isLightScreen: !!c.lightscreen,
    isAuroraVeil: !!c.auroraveil,
    isTailwind: !!c.tailwind,
  };
}

/** Field for a move used by `attacker`'s side against the other side. */
export function clientField(battle: ClientBattle, attacker: SideId): FieldSpec {
  return {
    weather: battle.field.weather ?? '',
    terrain: battle.field.terrain ?? '',
    isGravity: !!battle.field.pseudoWeather.gravity,
    attackerSide: sideSpec(battle, attacker),
    defenderSide: sideSpec(battle, attacker === 'p1' ? 'p2' : 'p1'),
  };
}
