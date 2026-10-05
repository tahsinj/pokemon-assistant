/** Battle state as a player sees it, rebuilt from protocol lines with @pkmn/client. */
import { Battle as ClientBattle } from '@pkmn/client';
import { Generations, type ID, type PokemonSet } from '@pkmn/data';
import { Dex } from '@pkmn/sim';
import type { SideId } from './types';

let gens: Generations | null = null;

export interface ClientOptions {
  /** The side whose view this is; its own sets can then be given in `sets`. */
  player?: SideId;
  /** The player's team, in order, so its Pokémon carry their full sets. */
  sets?: PokemonSet[];
}

/** An empty client battle to feed lines into with `add`. */
export function newClientBattle(o: ClientOptions = {}): ClientBattle {
  gens ??= new Generations(Dex as never);
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
