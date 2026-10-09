/** Battle state as a player sees it, rebuilt from protocol lines with @pkmn/client. */
import { Battle as ClientBattle } from '@pkmn/client';
import { Generations, type ID, type PokemonSet } from '@pkmn/data';
import { Dex } from '@pkmn/sim';
import type { SideId } from './types';

let gens: Generations | null = null;

/**
 * Like @pkmn/data's default, but keeps what National Dex allows: Pokémon,
 * Megas, Z-moves and items Gen 9 marks as "Past" or "Unobtainable". The
 * default drops them, and the client then fails on the first one it sees.
 */
function exists(d: Parameters<typeof Generations.DEFAULT_EXISTS>[0]): boolean {
  if (!d.exists) return false;
  const nonstandard = 'isNonstandard' in d ? d.isNonstandard : null;
  // Gen 9 gives these the tier "Illegal", so they skip the tier check below.
  if (nonstandard === 'Past' || nonstandard === 'Unobtainable') return true;
  if (nonstandard) return false;
  if (d.kind === 'Ability' && d.id === 'noability') return false;
  return !('tier' in d && ['Illegal', 'Unreleased'].includes(d.tier as string));
}

export interface ClientOptions {
  /** The side whose view this is; its own sets can then be given in `sets`. */
  player?: SideId;
  /** The player's team, in order, so its Pokémon carry their full sets. */
  sets?: PokemonSet[];
}

/** An empty client battle to feed lines into with `add`. */
export function newClientBattle(o: ClientOptions = {}): ClientBattle {
  gens ??= new Generations(Dex as never, exists);
  // A flat list of sets goes to p1; p2's sets sit in the second slot.
  const sets = o.sets && o.player === 'p2' ? [undefined, o.sets] : o.sets;
  return new ClientBattle(gens, (o.player ?? null) as ID | null, sets);
}

export function clientBattle(lines: readonly string[], o: ClientOptions = {}): ClientBattle {
  const battle = newClientBattle(o);
  for (const line of lines) {
    if (line.startsWith('|')) battle.add(line);
  }
  return battle;
}

export type { ClientBattle };

/** National dex number for any species or form name the simulator knows; 0 when unknown. */
export function dexNumber(species: string): number {
  return Dex.species.get(species).num || 0;
}
