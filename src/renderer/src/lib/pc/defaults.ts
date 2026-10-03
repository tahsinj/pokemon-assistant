import type { PcStatSpread, PcGender } from '../bridgeTypes';
import type { StatKey } from '../types';

export const PC_SLOTS_PER_BOX = 30;
export const PC_GRID_COLS = 6;

export const DEFAULT_IVS: PcStatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
export const ZERO_EVS: PcStatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export const STAT_ORDER: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

export function emptyMoves(): string[] {
  return ['', '', '', ''];
}

export function normalizeMoves(moves: string[]): string[] {
  const out = moves.map((m) => m.trim()).filter(Boolean).slice(0, 4);
  while (out.length < 4) out.push('');
  return out;
}

export function defaultGender(): PcGender {
  return 'genderless';
}

/** MIME for HTML5 drag-and-drop between PC slots/boxes. */
export const PC_POKEMON_DRAG_TYPE = 'application/x-stablab-pc-pokemon';

/** MIME for dragging a box tab to reorder the box list. */
export const PC_BOX_DRAG_TYPE = 'application/x-stablab-pc-box';

export function firstEmptySlot(occupants: { slot: number }[]): number | null {
  const used = new Set(occupants.map((o) => o.slot));
  for (let slot = 0; slot < PC_SLOTS_PER_BOX; slot++) {
    if (!used.has(slot)) return slot;
  }
  return null;
}
