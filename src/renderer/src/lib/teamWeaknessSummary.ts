import type { Pokemon } from './types';
import { TYPES, effectiveness } from './typechart';

/** Count how many team members take >1× from this attacking type. */
export function weaknessCounts(team: Pokemon[]): { attackType: string; weakCount: number }[] {
  const rows: { attackType: string; weakCount: number }[] = [];
  for (const t of TYPES) {
    let weak = 0;
    for (const m of team) {
      if (effectiveness(t, m.types) > 1) weak++;
    }
    rows.push({ attackType: t, weakCount: weak });
  }
  return rows.sort((a, b) => b.weakCount - a.weakCount);
}

/** Types that hit at least `minCount` of your Pokémon super-effectively (default 3 = "massive"). */
export function massiveSharedWeaknesses(team: Pokemon[], minCount = 3): { attackType: string; weakCount: number }[] {
  if (team.length === 0) return [];
  return weaknessCounts(team).filter((r) => r.weakCount >= minCount);
}
