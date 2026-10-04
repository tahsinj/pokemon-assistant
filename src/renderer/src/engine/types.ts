/** Shapes of the requests the simulator sends each player (singles only). */

export type SideId = 'p1' | 'p2';

export interface RequestMove {
  move: string;
  id: string;
  pp?: number;
  maxpp?: number;
  target?: string;
  disabled?: string | boolean;
}

export interface RequestActive {
  moves: RequestMove[];
  trapped?: boolean;
  maybeTrapped?: boolean;
  canTerastallize?: string;
  canMegaEvo?: boolean;
}

export interface RequestPokemon {
  /** "p1: Garchomp" */
  ident: string;
  /** "Garchomp, L100, M" */
  details: string;
  /** "319/319", "45/319 par" or "0 fnt" */
  condition: string;
  active: boolean;
  stats: Record<'atk' | 'def' | 'spa' | 'spd' | 'spe', number>;
  moves: string[];
  baseAbility: string;
  ability?: string;
  item: string;
  teraType?: string;
  terastallized?: string;
}

export interface BattleRequest {
  wait?: true;
  teamPreview?: true;
  forceSwitch?: boolean[];
  active?: RequestActive[];
  side: { name: string; id: SideId; pokemon: RequestPokemon[] };
  maxChosenTeamSize?: number;
  noCancel?: boolean;
  rqid?: number;
}

export const isFainted = (p: RequestPokemon): boolean => p.condition.endsWith(' fnt') || p.condition.startsWith('0');
