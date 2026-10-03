import type { BaseStats, StatKey } from './types';

export const NATURES: Record<string, { plus?: StatKey; minus?: StatKey }> = {
  Hardy: {}, Lonely: { plus: 'atk', minus: 'def' }, Brave: { plus: 'atk', minus: 'spe' },
  Adamant: { plus: 'atk', minus: 'spa' }, Naughty: { plus: 'atk', minus: 'spd' },
  Bold: { plus: 'def', minus: 'atk' }, Docile: {}, Relaxed: { plus: 'def', minus: 'spe' },
  Impish: { plus: 'def', minus: 'spa' }, Lax: { plus: 'def', minus: 'spd' },
  Timid: { plus: 'spe', minus: 'atk' }, Hasty: { plus: 'spe', minus: 'def' },
  Serious: {}, Jolly: { plus: 'spe', minus: 'spa' }, Naive: { plus: 'spe', minus: 'spd' },
  Modest: { plus: 'spa', minus: 'atk' }, Mild: { plus: 'spa', minus: 'def' },
  Quiet: { plus: 'spa', minus: 'spe' }, Bashful: {}, Rash: { plus: 'spa', minus: 'spd' },
  Calm: { plus: 'spd', minus: 'atk' }, Gentle: { plus: 'spd', minus: 'def' },
  Sassy: { plus: 'spd', minus: 'spe' }, Careful: { plus: 'spd', minus: 'spa' }, Quirky: {},
};

export function calcStat(
  key: StatKey,
  base: number,
  iv: number,
  ev: number,
  level: number,
  nature: string,
): number {
  if (key === 'hp') {
    if (base === 1) return 1; // Shedinja
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  const val = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
  const n = NATURES[nature] || {};
  if (n.plus === key) return Math.floor(val * 1.1);
  if (n.minus === key) return Math.floor(val * 0.9);
  return val;
}

export function calcAllStats(
  baseStats: BaseStats,
  ivs: BaseStats,
  evs: BaseStats,
  level: number,
  nature: string,
): BaseStats {
  return {
    hp:  calcStat('hp',  baseStats.hp,  ivs.hp,  evs.hp,  level, nature),
    atk: calcStat('atk', baseStats.atk, ivs.atk, evs.atk, level, nature),
    def: calcStat('def', baseStats.def, ivs.def, evs.def, level, nature),
    spa: calcStat('spa', baseStats.spa, ivs.spa, evs.spa, level, nature),
    spd: calcStat('spd', baseStats.spd, ivs.spd, evs.spd, level, nature),
    spe: calcStat('spe', baseStats.spe, ivs.spe, evs.spe, level, nature),
  };
}

export const STAT_LABELS: Record<StatKey, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};

export function bst(s: BaseStats) {
  return s.hp + s.atk + s.def + s.spa + s.spd + s.spe;
}

const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

/** Non-zero EV yields as display entries, e.g. [{ label: 'SpA', value: 1 }]. */
export function formatEvYield(y: Partial<Record<StatKey, number>> | undefined): { label: string; value: number }[] {
  if (!y) return [];
  return STAT_KEYS.filter((k) => y[k]).map((k) => ({ label: STAT_LABELS[k], value: y[k]! }));
}
