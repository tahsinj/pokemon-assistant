/**
 * Breeding outcome probabilities (mainline Gen 6+ mechanics):
 *
 *  - 3 IVs are inherited from the parents - 5 with a Destiny Knot on either
 *    parent (holding two changes nothing). Inherited stats are picked without
 *    replacement; each picked stat comes from a uniformly random parent.
 *  - A Power item guarantees its stat is inherited from the holder and
 *    consumes one inheritance slot. If both parents hold Power items, one of
 *    the two effects is chosen at 50/50.
 *  - Non-inherited stats roll uniform 0-31 (P(31) = 1/32).
 *  - Everstone passes the holder's nature (both holders -> 50/50); otherwise
 *    the nature is uniform random.
 *  - Ability comes from the mother (or the non-Ditto parent): hidden-ability
 *    mothers pass the HA at 60%, otherwise a regular slot; regular mothers
 *    keep their slot at 80% / 20% the other regular slot.
 *
 * All IV math below is exact enumeration over inheritance scenarios - no
 * Monte Carlo. Stats are conditionally independent given a scenario, so joint
 * probabilities are per-stat products and the perfect-IV count is a Poisson
 * binomial convolution.
 */
import type { BaseStats, StatKey } from './types';

export type BreedingItem =
  | 'none'
  | 'destiny-knot'
  | 'everstone'
  | 'power-hp'
  | 'power-atk'
  | 'power-def'
  | 'power-spa'
  | 'power-spd'
  | 'power-spe';

export type StatTarget = 'any' | '31' | 'ge30' | '0';

export interface BreedingIvConfig {
  femaleIvs: BaseStats;
  maleIvs: BaseStats;
  femaleItem: BreedingItem;
  maleItem: BreedingItem;
}

export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

export const POWER_ITEM_STAT: Partial<Record<BreedingItem, StatKey>> = {
  'power-hp': 'hp',
  'power-atk': 'atk',
  'power-def': 'def',
  'power-spa': 'spa',
  'power-spd': 'spd',
  'power-spe': 'spe',
};

type Parent = 'female' | 'male';

interface Scenario {
  /** Probability weight of this scenario. */
  w: number;
  /** Stat fixed by a winning Power item, inherited from exactly that parent. */
  fixed?: { stat: StatKey; parent: Parent };
  /** Stats inherited from a uniformly random parent. */
  randomInherited: StatKey[];
}

function combinations<T>(pool: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > pool.length) return [];
  const [head, ...rest] = pool;
  return [
    ...combinations(rest, k - 1).map((c) => [head, ...c]),
    ...combinations(rest, k),
  ];
}

function* scenarios(c: BreedingIvConfig): Generator<Scenario> {
  const slots =
    c.femaleItem === 'destiny-knot' || c.maleItem === 'destiny-knot' ? 5 : 3;

  const powers: { stat: StatKey; parent: Parent }[] = [];
  const femalePower = POWER_ITEM_STAT[c.femaleItem];
  const malePower = POWER_ITEM_STAT[c.maleItem];
  if (femalePower) powers.push({ stat: femalePower, parent: 'female' });
  if (malePower) powers.push({ stat: malePower, parent: 'male' });

  // Both parents holding Power items -> one effect wins at 50/50.
  const branches: { fixed?: Scenario['fixed']; w: number }[] =
    powers.length === 2
      ? powers.map((p) => ({ fixed: p, w: 0.5 }))
      : powers.length === 1
        ? [{ fixed: powers[0], w: 1 }]
        : [{ w: 1 }];

  for (const branch of branches) {
    const remaining = STAT_KEYS.filter((s) => s !== branch.fixed?.stat);
    const k = slots - (branch.fixed ? 1 : 0);
    const combos = combinations(remaining, k);
    for (const combo of combos) {
      yield { w: branch.w / combos.length, fixed: branch.fixed, randomInherited: combo };
    }
  }
}

/** P(stat satisfies `pred`) within one scenario. */
function statProbability(
  c: BreedingIvConfig,
  s: Scenario,
  stat: StatKey,
  pred: (iv: number) => boolean,
): number {
  if (s.fixed && s.fixed.stat === stat) {
    const iv = s.fixed.parent === 'female' ? c.femaleIvs[stat] : c.maleIvs[stat];
    return pred(iv) ? 1 : 0;
  }
  if (s.randomInherited.includes(stat)) {
    return 0.5 * (pred(c.femaleIvs[stat]) ? 1 : 0) + 0.5 * (pred(c.maleIvs[stat]) ? 1 : 0);
  }
  let n = 0;
  for (let iv = 0; iv <= 31; iv++) if (pred(iv)) n++;
  return n / 32;
}

const TARGET_PRED: Record<StatTarget, (iv: number) => boolean> = {
  any: () => true,
  '31': (iv) => iv === 31,
  ge30: (iv) => iv >= 30,
  '0': (iv) => iv === 0,
};

/** Probability that every stat meets its target simultaneously. */
export function ivTargetProbability(
  c: BreedingIvConfig,
  targets: Record<StatKey, StatTarget>,
): number {
  let total = 0;
  for (const s of scenarios(c)) {
    let p = s.w;
    for (const stat of STAT_KEYS) {
      p *= statProbability(c, s, stat, TARGET_PRED[targets[stat]]);
      if (p === 0) break;
    }
    total += p;
  }
  return total;
}

/** P(exactly k stats are 31), k = 0..6 (Poisson binomial per scenario). */
export function perfectCountDistribution(c: BreedingIvConfig): number[] {
  const dist = new Array<number>(7).fill(0);
  for (const s of scenarios(c)) {
    let poly = [1]; // poly[k] = P(k perfect so far)
    for (const stat of STAT_KEYS) {
      const p = statProbability(c, s, stat, TARGET_PRED['31']);
      const next = new Array<number>(poly.length + 1).fill(0);
      for (let k = 0; k < poly.length; k++) {
        next[k] += poly[k] * (1 - p);
        next[k + 1] += poly[k] * p;
      }
      poly = next;
    }
    for (let k = 0; k <= 6; k++) dist[k] += s.w * (poly[k] ?? 0);
  }
  return dist;
}

/** P(stat = 31) for each stat individually. */
export function perStat31Probability(c: BreedingIvConfig): Record<StatKey, number> {
  const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  for (const s of scenarios(c)) {
    for (const stat of STAT_KEYS) {
      out[stat] += s.w * statProbability(c, s, stat, TARGET_PRED['31']);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Nature / ability / gender
// ---------------------------------------------------------------------------

export interface NatureOutcome {
  /** 'random' = uniform across all 25 natures. */
  nature: string | 'random';
  p: number;
}

export function natureDistribution(
  femaleItem: BreedingItem,
  maleItem: BreedingItem,
  femaleNature: string,
  maleNature: string,
): NatureOutcome[] {
  const fEs = femaleItem === 'everstone';
  const mEs = maleItem === 'everstone';
  if (fEs && mEs) {
    if (femaleNature === maleNature) return [{ nature: femaleNature, p: 1 }];
    return [
      { nature: femaleNature, p: 0.5 },
      { nature: maleNature, p: 0.5 },
    ];
  }
  if (fEs) return [{ nature: femaleNature, p: 1 }];
  if (mEs) return [{ nature: maleNature, p: 1 }];
  return [{ nature: 'random', p: 1 }];
}

export interface AbilityOutcome {
  ability: string;
  p: number;
  hidden: boolean;
}

/**
 * Offspring ability distribution given the mother's (or non-Ditto parent's)
 * ability. Unknown ability names fall back to slot 1.
 */
export function abilityDistribution(
  species: { abilities: string[]; hiddenAbilities: string[] },
  motherAbility: string,
): AbilityOutcome[] {
  const regular = species.abilities.filter((a) => !species.hiddenAbilities.includes(a));
  const isHidden = species.hiddenAbilities.includes(motherAbility);

  if (isHidden) {
    const out: AbilityOutcome[] = [{ ability: motherAbility, p: 0.6, hidden: true }];
    for (const a of regular) out.push({ ability: a, p: 0.4 / Math.max(1, regular.length), hidden: false });
    if (regular.length === 0) out[0].p = 1;
    return out;
  }

  if (regular.length <= 1) {
    return [{ ability: regular[0] ?? motherAbility, p: 1, hidden: false }];
  }
  const same = regular.includes(motherAbility) ? motherAbility : regular[0];
  const others = regular.filter((a) => a !== same);
  return [
    { ability: same, p: 0.8, hidden: false },
    ...others.map((a) => ({ ability: a, p: 0.2 / others.length, hidden: false })),
  ];
}

/** Standard mainline gender ratios (P(male)); null = genderless. */
export const GENDER_RATIOS: { label: string; maleP: number | null }[] = [
  { label: '50% ♂ / 50% ♀', maleP: 0.5 },
  { label: '87.5% ♂ (starters)', maleP: 0.875 },
  { label: '75% ♂', maleP: 0.75 },
  { label: '25% ♂', maleP: 0.25 },
  { label: '12.5% ♂', maleP: 0.125 },
  { label: '100% ♂', maleP: 1 },
  { label: '100% ♀', maleP: 0 },
  { label: 'Genderless', maleP: null },
];
