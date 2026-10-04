/** Battle state as a player sees it, rebuilt from protocol lines with @pkmn/client. */
import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Dex } from '@pkmn/sim';

let gens: Generations | null = null;

export function clientBattle(lines: readonly string[]): ClientBattle {
  gens ??= new Generations(Dex as never);
  const battle = new ClientBattle(gens);
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
