// Derived intelligence for the Move viewer: type coverage from the type chart,
// human-readable flag/target labels, and a reverse "who learns this" index
// built from each species' learnset in pokemon.json.
import type { Move, Pokemon } from './types';
import { CHART, TYPES, type Type } from './typechart';

export type LearnMethod = 'level' | 'tm' | 'egg' | 'tutor' | 'tutor-legacy' | 'special';

const METHOD_FROM_RAW: Record<string, LearnMethod> = {
  egg: 'egg',
  tm: 'tm',
  tutor: 'tutor',
  legacy: 'tutor-legacy',
  special: 'special',
};

export const METHOD_LABEL: Record<LearnMethod, string> = {
  level: 'Level',
  tm: 'TM',
  egg: 'Egg',
  tutor: 'Tutor',
  'tutor-legacy': 'Legacy',
  special: 'Event',
};

/** A species that can learn a given move, and the ways it learns it. */
export interface MoveLearner {
  id: string;
  name: string;
  dex: number;
  types: string[];
  methods: LearnMethod[];
  /** Lowest level it's learned at, when learned by leveling up. */
  level?: number;
}

const rawToMethod = (raw: string): LearnMethod =>
  /^\d+$/.test(raw) ? 'level' : (METHOD_FROM_RAW[raw] ?? 'special');

const METHOD_ORDER: LearnMethod[] = ['level', 'tm', 'egg', 'tutor', 'tutor-legacy', 'special'];

/**
 * Reverse the per-species learnsets into a moveId -> learners map. Cosmetic
 * forms share their base's learnset, so we de-dupe by dex to keep one row per
 * National Dex number (e.g. all Rotom forms collapse to a single Rotom entry).
 */
export function buildLearnerIndex(pokemon: Pokemon[]): Map<string, MoveLearner[]> {
  const byMove = new Map<string, Map<number, MoveLearner>>();
  for (const p of pokemon) {
    for (const entry of p.moves ?? []) {
      const method = rawToMethod(String(entry.learn));
      let perDex = byMove.get(entry.move);
      if (!perDex) byMove.set(entry.move, (perDex = new Map()));
      let learner = perDex.get(p.dex);
      if (!learner) {
        perDex.set(p.dex, (learner = { id: p.id, name: p.name, dex: p.dex, types: p.types, methods: [] }));
      }
      if (!learner.methods.includes(method)) learner.methods.push(method);
      if (method === 'level') {
        const lvl = Number(entry.learn);
        if (Number.isFinite(lvl) && (learner.level == null || lvl < learner.level)) learner.level = lvl;
      }
    }
  }
  const out = new Map<string, MoveLearner[]>();
  for (const [moveId, perDex] of byMove) {
    const list = [...perDex.values()];
    for (const l of list) l.methods.sort((a, b) => METHOD_ORDER.indexOf(a) - METHOD_ORDER.indexOf(b));
    list.sort((a, b) => a.dex - b.dex);
    out.set(moveId, list);
  }
  return out;
}

export interface TypeCoverage {
  strong: Type[]; // 2x against this single defending type
  weak: Type[]; // 0.5x
  immune: Type[]; // 0x
}

/**
 * What a damaging move of this type does against each single defending type.
 * Dual-type interactions compound from these, but the single-type breakdown is
 * the most legible at a glance.
 */
export function typeCoverage(attackType: string): TypeCoverage {
  const row = CHART[attackType.toLowerCase() as Type];
  const cov: TypeCoverage = { strong: [], weak: [], immune: [] };
  if (!row) return cov;
  for (const def of TYPES) {
    const m = row[def];
    if (m === 2) cov.strong.push(def);
    else if (m === 0.5) cov.weak.push(def);
    else if (m === 0) cov.immune.push(def);
  }
  return cov;
}

/** Player-relevant flags worth surfacing, with short explanations. Engine-only
 *  flags (mirror, metronome, fail*, no*, …) are intentionally omitted. */
export const FLAG_INFO: Record<string, { label: string; desc: string }> = {
  contact: { label: 'Contact', desc: 'Makes contact - triggers Rough Skin, Static, Rocky Helmet, etc.' },
  protect: { label: 'Blockable', desc: 'Blocked by Protect / Detect.' },
  sound: { label: 'Sound', desc: 'Sound-based - ignored by Soundproof; hits through Substitute.' },
  punch: { label: 'Punch', desc: 'Boosted 1.2× by Iron Fist.' },
  bite: { label: 'Bite', desc: 'Boosted 1.5× by Strong Jaw.' },
  pulse: { label: 'Pulse', desc: 'Boosted 1.5× by Mega Launcher.' },
  bullet: { label: 'Bullet', desc: 'Ball/bomb move - blocked by Bulletproof.' },
  slicing: { label: 'Slicing', desc: 'Boosted 1.5× by Sharpness.' },
  wind: { label: 'Wind', desc: 'Wind move - triggers Wind Power / Wind Rider.' },
  powder: { label: 'Powder', desc: 'No effect on Grass types, Overcoat, or Safety Goggles.' },
  dance: { label: 'Dance', desc: 'Copied by Dancer.' },
  bypasssub: { label: 'Bypasses Sub', desc: 'Hits through Substitute.' },
  heal: { label: 'Heal', desc: 'Restores HP - blocked by Heal Block.' },
  recharge: { label: 'Recharge', desc: 'User must recharge the following turn.' },
  charge: { label: 'Two-turn', desc: 'Charges on the first turn, attacks on the second.' },
  defrost: { label: 'Thaws', desc: 'Thaws the user if frozen.' },
  reflectable: { label: 'Reflectable', desc: 'Bounced back by Magic Coat / Magic Bounce.' },
  snatch: { label: 'Snatchable', desc: 'Can be stolen by Snatch.' },
  gravity: { label: 'Grounded only', desc: 'Unusable under the effects that disable it (e.g. Gravity restrictions).' },
  futuremove: { label: 'Delayed', desc: 'Hits two turns after use.' },
};

export const TARGET_LABEL: Record<string, string> = {
  normal: 'Single target',
  adjacentFoe: 'Single foe',
  any: 'Any single target',
  randomNormal: 'Random foe',
  allAdjacentFoes: 'All foes (spread)',
  allAdjacent: 'All adjacent',
  all: 'Whole field',
  self: 'User',
  adjacentAlly: 'An ally',
  adjacentAllyOrSelf: 'User or ally',
  allies: 'All allies',
  allyTeam: "User's team",
  allySide: "User's side",
  foeSide: "Foe's side",
  scripted: 'Counterattack',
};

export const targetLabel = (t: string): string => TARGET_LABEL[t] ?? t;

/** "+1 (moves first)" style label for the priority bracket. */
export function priorityLabel(p: number): string {
  if (p === 0) return 'Normal';
  const sign = p > 0 ? '+' : '';
  return `${sign}${p} (${p > 0 ? 'moves first' : 'moves last'})`;
}
