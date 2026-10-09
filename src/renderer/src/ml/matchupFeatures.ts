/**
 * Features of a one-on-one matchup, set A against set B, for the matchup
 * model. Simulation data and the app compute them with this same code, so a
 * model trained on one sees the same numbers in the other (the training code
 * never re-implements mechanics).
 *
 * Every feature is a number. Names are stable: the model is trained on them,
 * so renaming one or changing its meaning needs a new model.
 */
import { Dex } from '@pkmn/sim';
import { calcDamage, type DamageOutcome } from '../lib/battle/damage';
import { EMPTY_FIELD, type BattlePokemonSpec } from '../lib/battle/types';
import { calcStat } from '../lib/stats';

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const RECOVERY = new Set([
  'recover', 'roost', 'slackoff', 'softboiled', 'synthesis', 'moonlight', 'morningsun', 'shoreup', 'milkdrink',
  'strengthsap', 'wish', 'rest', 'junglehealing', 'lunarblessing',
]);
const SETUP = new Set([
  'swordsdance', 'dragondance', 'nastyplot', 'calmmind', 'bulkup', 'quiverdance', 'shellsmash', 'shiftgear',
  'coil', 'agility', 'rockpolish', 'tailglow', 'geomancy', 'victorydance', 'tidyup', 'irondefense', 'curse',
  'bellydrum', 'noretreat', 'clangoroussoul', 'filletaway', 'growth', 'workup', 'cosmicpower', 'amnesia',
]);
const STATUS_MOVES = new Set(['willowisp', 'thunderwave', 'toxic', 'spore', 'sleeppowder', 'yawn', 'glare', 'nuzzle', 'stunspore', 'hypnosis']);
const PIVOT = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport', 'shedtail', 'chillyreception']);
const PHAZE = new Set(['whirlwind', 'roar', 'dragontail', 'circlethrow', 'haze', 'clearsmog']);

const CHOICE = new Set(['choiceband', 'choicespecs', 'choicescarf']);

function speed(spec: BattlePokemonSpec): number {
  const base = Dex.species.get(spec.speciesName).baseStats.spe;
  let spe = calcStat('spe', base, spec.ivs.spe, spec.evs.spe, spec.level, spec.nature);
  if (toId(spec.item ?? '') === 'choicescarf') spe = Math.floor(spe * 1.5);
  return spe;
}

function stat(spec: BattlePokemonSpec, key: 'hp' | 'atk' | 'def' | 'spa' | 'spd'): number {
  const base = Dex.species.get(spec.speciesName).baseStats[key];
  return calcStat(key, base, spec.ivs[key], spec.evs[key], spec.level, spec.nature);
}

interface Attack {
  /** Mean share of the target's max HP, 0 to 1 (can exceed 1). */
  mean: number;
  max: number;
  /** Hits to KO from full at the mean roll (capped at 10). */
  hits: number;
  /** Chance the best move KOs in one hit. */
  ohko: number;
  priority: number;
}

function bestAttack(atk: BattlePokemonSpec, def: BattlePokemonSpec): Attack {
  let best: Attack = { mean: 0, max: 0, hits: 10, ohko: 0, priority: 0 };
  let bestPriority = 0;
  for (const m of atk.moves) {
    const d: DamageOutcome = calcDamage(9, atk, { ...def, currentHPPercent: 100 }, m.name, EMPTY_FIELD);
    if (d.error || d.isZero) continue;
    const mean = (d.pctMin + d.pctMax) / 200;
    const priority = Dex.moves.get(m.name).priority;
    if (priority > 0 && mean > 0.05) bestPriority = Math.max(bestPriority, priority);
    if (mean > best.mean) {
      best = { mean, max: d.pctMax / 100, hits: Math.min(10, Math.ceil(1 / Math.max(mean, 0.1))), ohko: d.ko.n === 1 ? d.ko.chance : 0, priority };
    }
  }
  return { ...best, priority: bestPriority };
}

function roles(spec: BattlePokemonSpec): Record<string, number> {
  const ids = spec.moves.map((m) => toId(m.name));
  const has = (set: Set<string>) => (ids.some((id) => set.has(id)) ? 1 : 0);
  const item = toId(spec.item ?? '');
  return {
    recovery: has(RECOVERY),
    setup: has(SETUP),
    status: has(STATUS_MOVES),
    pivot: has(PIVOT),
    phaze: has(PHAZE),
    choice: CHOICE.has(item) ? 1 : 0,
    leftovers: item === 'leftovers' || item === 'blacksludge' ? 1 : 0,
    sash: item === 'focussash' ? 1 : 0,
    noItem: item ? 0 : 1,
  };
}

/** Feature names in a fixed order, for the model's input vector. */
export const FEATURE_NAMES: readonly string[] = (() => {
  const side = (p: string) => [
    `${p}_hp`, `${p}_atk`, `${p}_def`, `${p}_spa`, `${p}_spd`, `${p}_spe`, `${p}_level`,
    `${p}_dmg_mean`, `${p}_dmg_max`, `${p}_hits_to_ko`, `${p}_ohko`, `${p}_priority`,
    `${p}_recovery`, `${p}_setup`, `${p}_status`, `${p}_pivot`, `${p}_phaze`,
    `${p}_choice`, `${p}_leftovers`, `${p}_sash`, `${p}_no_item`,
  ];
  return [...side('a'), ...side('b'), 'a_faster', 'speed_ratio', 'hits_diff'];
})();

/** The matchup's features, by name. "a" is the side whose win chance the model predicts. */
export function matchupFeatures(a: BattlePokemonSpec, b: BattlePokemonSpec): Record<string, number> {
  const out: Record<string, number> = {};
  const side = (p: 'a' | 'b', me: BattlePokemonSpec, them: BattlePokemonSpec) => {
    for (const k of ['hp', 'atk', 'def', 'spa', 'spd'] as const) out[`${p}_${k}`] = stat(me, k);
    out[`${p}_spe`] = speed(me);
    out[`${p}_level`] = me.level;
    const hit = bestAttack(me, them);
    out[`${p}_dmg_mean`] = hit.mean;
    out[`${p}_dmg_max`] = hit.max;
    out[`${p}_hits_to_ko`] = hit.hits;
    out[`${p}_ohko`] = hit.ohko;
    out[`${p}_priority`] = hit.priority;
    const r = roles(me);
    out[`${p}_recovery`] = r.recovery;
    out[`${p}_setup`] = r.setup;
    out[`${p}_status`] = r.status;
    out[`${p}_pivot`] = r.pivot;
    out[`${p}_phaze`] = r.phaze;
    out[`${p}_choice`] = r.choice;
    out[`${p}_leftovers`] = r.leftovers;
    out[`${p}_sash`] = r.sash;
    out[`${p}_no_item`] = r.noItem;
  };
  side('a', a, b);
  side('b', b, a);
  out.a_faster = out.a_spe > out.b_spe ? 1 : out.a_spe === out.b_spe ? 0.5 : 0;
  out.speed_ratio = out.a_spe / Math.max(1, out.b_spe);
  out.hits_diff = out.b_hits_to_ko - out.a_hits_to_ko;
  return out;
}

/** The features as a vector in `FEATURE_NAMES` order. */
export function featureVector(f: Record<string, number>): number[] {
  return FEATURE_NAMES.map((n) => f[n] ?? 0);
}
