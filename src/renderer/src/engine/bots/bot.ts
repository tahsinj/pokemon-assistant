import type { Engine } from '../engine';
import type { BattleRequest, SideId } from '../types';

/** A battle opponent. `choose` returns a Showdown choice string for the side's current request. */
export interface Bot {
  readonly level: number;
  readonly name: string;
  choose(engine: Engine, side: SideId, request: BattleRequest): string;
}

export const foeOf = (side: SideId): SideId => (side === 'p1' ? 'p2' : 'p1');
