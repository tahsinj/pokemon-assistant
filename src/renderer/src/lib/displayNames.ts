/**
 * Resolve stored id-form names ("protean", "watershuriken") to display names
 * ("Protean", "Water Shuriken"). The dex stores abilities and learnset moves
 * as Showdown ids; anything user-facing should go through here.
 */
import { ABILITIES } from '@smogon/calc';
import type { Move, Pokemon } from './types';

const normId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Built once from @smogon/calc's latest-gen ability table.
const ABILITY_NAME_BY_ID: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  const latest = ABILITIES[ABILITIES.length - 1] ?? [];
  for (const name of latest) map[normId(name)] = name;
  return map;
})();

/** Ability id or display name -> display name, title-cased fallback. */
export function abilityName(raw: string): string {
  if (!raw) return raw;
  return (
    ABILITY_NAME_BY_ID[normId(raw)] ??
    raw.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

/** Move id or display name -> display name via the loaded moves bundle. */
export function moveName(raw: string, moves: Record<string, Move>): string {
  if (!raw) return raw;
  return moves[normId(raw)]?.name ?? raw;
}

/** Move lookup tolerant of both id-form and display-name-form input. */
export function findMove(raw: string, moves: Record<string, Move>): Move | undefined {
  if (!raw) return undefined;
  return moves[normId(raw)];
}

/** A species name split for lists: the base name, plus a label for alternate forms. */
export function speciesParts(p: Pick<Pokemon, 'name' | 'baseSpecies' | 'forme'>): { base: string; form: string | null } {
  if (!p.forme) return { base: p.name, form: null };
  return { base: p.baseSpecies ?? p.name, form: p.forme.replace(/-/g, ' ') };
}

/** How a move is learned, for display: "Lv 12", "TM", "Tutor", "Egg", "Event", "Past gen". */
export function learnLabel(learn: string): string {
  if (/^\d+$/.test(learn)) return `Lv ${learn}`;
  if (learn === 'tm') return 'TM';
  if (learn === 'legacy') return 'Past gen';
  return learn.charAt(0).toUpperCase() + learn.slice(1);
}
