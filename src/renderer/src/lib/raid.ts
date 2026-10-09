/**
 * Raid planner: one strong boss against your box. The boss is a normal set
 * with generic knobs (HP multiplier, stat boosts, actions per turn, a turn
 * limit); no particular game's raid rules are modelled.
 *
 * The quick estimate runs on the calc: damage per turn both ways, who moves
 * first, and an estimator in the style of Pokebattler's: how many of this
 * Pokémon it takes to bring the boss down (under 1 means it can solo it).
 */
import { Dex } from '@pkmn/sim';
import { calcDamage, type DamageOutcome } from './battle/damage';
import { EMPTY_FIELD, type BattlePokemonSpec } from './battle/types';
import { calcStat } from './stats';
import type { BaseStats, Move, Pokemon } from './types';

export type BoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe';

export interface RaidRules {
  /** Defaults to the format level. */
  bossLevel: number;
  /** Boss HP compared with a normal Pokémon of its kind. */
  hpMultiplier: number;
  statBoosts: Partial<Record<BoostStat, number>>;
  /** 1 or 2. */
  bossActionsPerTurn: number;
  /** Turns before the raid is lost. */
  turnLimit: number;
}

export type RaidPreset = 'normal' | 'tough' | 'brutal';

export const RAID_PRESETS: Record<RaidPreset, RaidRules> = {
  normal: { bossLevel: 100, hpMultiplier: 3, statBoosts: {}, bossActionsPerTurn: 1, turnLimit: 15 },
  tough: { bossLevel: 100, hpMultiplier: 5, statBoosts: { def: 1, spd: 1 }, bossActionsPerTurn: 1, turnLimit: 12 },
  brutal: { bossLevel: 100, hpMultiplier: 8, statBoosts: { atk: 1, def: 1, spa: 1, spd: 1 }, bossActionsPerTurn: 2, turnLimit: 10 },
};

export interface RaidEstimate {
  /** Share of the boss's (multiplied) HP each of your hits takes. */
  dealt: number;
  /** Share of your HP the boss takes each turn, with all its actions. */
  taken: number;
  faster: boolean;
  /** Your hits needed to win, and the turns you last. */
  turnsToWin: number;
  turnsSurvived: number;
  /** How many of you it takes; under 1 means one can win alone within the turn limit. */
  estimator: number;
  solo: boolean;
  moveName: string | null;
  bossMove: string | null;
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function best(attacker: BattlePokemonSpec, defender: BattlePokemonSpec): DamageOutcome | null {
  let top: DamageOutcome | null = null;
  for (const m of attacker.moves) {
    const d = calcDamage(9, attacker, { ...defender, currentHPPercent: 100 }, m.name, EMPTY_FIELD);
    if (d.error || d.isZero) continue;
    if (!top || d.pctMin + d.pctMax > top.pctMin + top.pctMax) top = d;
  }
  return top;
}

function speed(spec: BattlePokemonSpec, base: BaseStats): number {
  let spe = calcStat('spe', base.spe, spec.ivs.spe, spec.evs.spe, spec.level, spec.nature);
  const stage = spec.boosts?.spe ?? 0;
  spe = Math.floor(spe * (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)));
  if (toId(spec.item ?? '') === 'choicescarf') spe = Math.floor(spe * 1.5);
  return spe;
}

/** The boss's set with the raid's level and boosts applied. */
export function raidBoss(spec: BattlePokemonSpec, rules: RaidRules): BattlePokemonSpec {
  return { ...spec, level: rules.bossLevel, boosts: { ...rules.statBoosts }, currentHPPercent: 100 };
}

/** `boss` is the plain set; the raid's level and boosts are applied here. */
export function quickEstimate(
  member: BattlePokemonSpec,
  memberBase: BaseStats,
  plainBoss: BattlePokemonSpec,
  bossBase: BaseStats,
  rules: RaidRules,
): RaidEstimate {
  const boss = raidBoss(plainBoss, rules);
  const mine = best(member, boss);
  const theirs = best(boss, member);
  const dealt = mine ? (mine.pctMin + mine.pctMax) / 200 / rules.hpMultiplier : 0;
  const taken = theirs ? ((theirs.pctMin + theirs.pctMax) / 200) * rules.bossActionsPerTurn : 0;
  const faster = speed(member, memberBase) > speed(boss, bossBase);
  const turnsToWin = dealt > 0 ? Math.ceil(1 / dealt - 1e-9) : Infinity;
  const turnsSurvived = taken > 0 ? Math.ceil(1 / taken - 1e-9) : Infinity;
  // The slower side loses its last hit to the KO.
  const hits = Math.min(rules.turnLimit, faster ? turnsSurvived : turnsSurvived - 1);
  const damage = hits * dealt;
  return {
    dealt,
    taken,
    faster,
    turnsToWin,
    turnsSurvived,
    estimator: damage > 0 ? 1 / damage : Infinity,
    solo: hits >= turnsToWin,
    moveName: mine?.moveName ?? null,
    bossMove: theirs?.moveName ?? null,
  };
}

/** How much of a move's damage counts per turn in a long fight: accuracy, and turns lost charging or recharging. */
function reliability(name: string): number {
  const m = Dex.moves.get(name);
  // Fails when hit first, or knocks the user out.
  if (m.id === 'focuspunch' || m.selfdestruct) return 0;
  const accuracy = m.accuracy === true ? 1 : m.accuracy / 100;
  const slow = m.flags.charge || m.flags.recharge ? 0.5 : 1;
  return accuracy * slow;
}

/** Damaging moves the species learns, strongest against the boss first, counting accuracy and charge turns. */
export function bestMovesAgainst(member: BattlePokemonSpec, species: Pokemon, moves: Record<string, Move>, boss: BattlePokemonSpec): { name: string; dealt: number }[] {
  const seen = new Set<string>();
  const out: { name: string; dealt: number }[] = [];
  for (const lm of species.moves) {
    const m = moves[lm.move];
    if (!m || !m.power || seen.has(m.id)) continue;
    seen.add(m.id);
    const r = reliability(m.name);
    if (!r) continue;
    const d = calcDamage(9, { ...member, moves: [{ name: m.name }] }, boss, m.name, EMPTY_FIELD);
    if (!d.error && !d.isZero) out.push({ name: m.name, dealt: ((d.pctMin + d.pctMax) / 200) * r });
  }
  return out.sort((a, b) => b.dealt - a.dealt);
}

const ITEMS = ['Life Orb', 'Choice Band', 'Choice Specs', 'Expert Belt', 'Leftovers', 'Assault Vest'];

/** What to change for this boss: a move to teach, an item to hold. */
export function raidUpgrades(
  member: BattlePokemonSpec,
  species: Pokemon,
  moves: Record<string, Move>,
  boss: BattlePokemonSpec,
  bossBase: BaseStats,
  rules: RaidRules,
): { bestMoves: string[]; tips: string[] } {
  const ranked = bestMovesAgainst(member, species, moves, raidBoss(boss, rules));
  const bestMoves = ranked.slice(0, 4).map((m) => m.name);
  const now = quickEstimate(member, species.baseStats, boss, bossBase, rules);
  const tips: string[] = [];
  const top = ranked[0];
  const known = new Set(member.moves.map((m) => toId(m.name)));
  if (top && !known.has(toId(top.name)) && top.dealt / rules.hpMultiplier > now.dealt * 1.15) {
    tips.push(`Teach ${top.name}: ${Math.round((100 * top.dealt) / rules.hpMultiplier)}% of the boss per hit`);
  }
  let bestItem: { name: string; estimator: number } | null = null;
  for (const item of ITEMS) {
    if (toId(item) === toId(member.item ?? '')) continue;
    const e = quickEstimate({ ...member, item }, species.baseStats, boss, bossBase, rules).estimator;
    if (e < now.estimator * 0.9 && (!bestItem || e < bestItem.estimator)) bestItem = { name: item, estimator: e };
  }
  if (bestItem) tips.push(`Hold ${bestItem.name}`);
  return { bestMoves, tips };
}
