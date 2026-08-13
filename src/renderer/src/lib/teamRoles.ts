/**
 * Per-Pokémon competitive role classifier for the Team Builder composition
 * audit. Given a slot (species + optional set details + Smogon intel), it tags
 * the mon with the functional roles it fills (lead/hazards, wall, pivot, …).
 *
 * Pure - no React/IPC. Reuses the move-name sets and physical/special bias from
 * `recommender.ts` so there's one source of truth. When a slot has no concrete
 * moves (species-only), it falls back to the mon's likely Smogon/learnset set
 * and marks the read as inferred so the UI can flag it.
 */
import type { BaseStats, Move, Pokemon } from './types';
import type { MemberDetail } from './bridgeTypes';
import type { SmogonSpeciesIntel } from './smogon';
import {
  SETUP_MOVES,
  RECOVERY_MOVES,
  offensiveBias,
  suggestMoveset,
} from './recommender';

export type RoleTag =
  | 'hazard-setter'
  | 'hazard-control'
  | 'physical-attacker'
  | 'special-attacker'
  | 'setup-sweeper'
  | 'revenge-killer'
  | 'wall'
  | 'pivot'
  | 'cleric'
  | 'speed-control';

/** Fixed emit order so tags/checklists/tests are deterministic. */
export const ROLE_ORDER: RoleTag[] = [
  'hazard-setter',
  'hazard-control',
  'physical-attacker',
  'special-attacker',
  'setup-sweeper',
  'revenge-killer',
  'wall',
  'pivot',
  'cleric',
  'speed-control',
];

export interface MemberRoles {
  id: string;
  p: Pokemon;
  tags: RoleTag[];
  bias: 'physical' | 'special';
  /** Where the classified moves came from (UI marks inferred reads). */
  moveSource: 'detail' | 'smogon' | 'learnset' | 'none';
  /** Normalized move-name keys actually used to classify (test introspection). */
  effectiveMoves: string[];
}

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const HAZARD_MOVES = new Set(['stealthrock', 'spikes', 'toxicspikes', 'stickyweb']);
// Court Change / Mortal Spin clear hazards too (alongside Rapid Spin / Defog).
const HAZARD_CONTROL = new Set(['rapidspin', 'defog', 'mortalspin', 'courtchange']);
const PIVOT_MOVES = new Set(['uturn', 'voltswitch', 'flipturn', 'partingshot', 'teleport']);
const CLERIC_MOVES = new Set(['healbell', 'aromatherapy', 'wish']);
const STATUS_SPREAD = new Set([
  'thunderwave', 'willowisp', 'toxic', 'spore', 'sleeppowder', 'yawn', 'glare', 'nuzzle',
]);
// Sticky Web is speed control (it slows the opposing side) as well as a hazard.
const SPEED_CONTROL_MOVES = new Set(['trickroom', 'tailwind', 'stickyweb']);
const PIVOT_ABILITIES = new Set(['regenerator']);

/** Base-stat role bias - ported from bestSix.inferRole's stat branch. */
export function statRole(b: BaseStats): 'physical' | 'special' | 'bulk' | 'mixed' {
  if (b.hp + b.def + b.spd > b.atk + b.spa + b.spe) return 'bulk';
  const ratio = b.atk / Math.max(1, b.spa);
  if (ratio > 1.15) return 'physical';
  if (ratio < 0.87) return 'special';
  return 'mixed';
}

/**
 * Resolve the move names to classify against. Priority: the slot's own set ->
 * the mon's top Smogon moves (learnable only) -> a heuristic learnset set -> none.
 */
export function effectiveMoves(
  p: Pokemon,
  detail: MemberDetail | null,
  intel: SmogonSpeciesIntel | null,
  moves: Record<string, Move>,
): { names: string[]; source: MemberRoles['moveSource'] } {
  const own = (detail?.moves ?? []).filter((m) => m && m.trim());
  if (own.length) return { names: own.map(norm), source: 'detail' };

  if (intel?.moves?.length) {
    const learnable = new Set(p.moves.map((m) => m.move));
    const smogonMoves = intel.moves
      .map((m) => m.name)
      .filter((name) => learnable.has(norm(name)))
      .slice(0, 4);
    if (smogonMoves.length) return { names: smogonMoves.map(norm), source: 'smogon' };
  }

  const learnt = suggestMoveset(p, moves, { smogon: intel }).map((s) => s.move.name);
  if (learnt.length) return { names: learnt.map(norm), source: 'learnset' };

  return { names: [], source: 'none' };
}

function abilityOf(p: Pokemon, detail: MemberDetail | null, intel: SmogonSpeciesIntel | null): string {
  return norm(detail?.ability || intel?.abilities?.[0]?.name || p.abilities[0] || '');
}

function itemOf(detail: MemberDetail | null, intel: SmogonSpeciesIntel | null): string {
  return norm(detail?.item || intel?.items?.[0]?.name || '');
}

export function classifyMember(
  p: Pokemon,
  detail: MemberDetail | null,
  intel: SmogonSpeciesIntel | null,
  moves: Record<string, Move>,
): MemberRoles {
  const { names, source } = effectiveMoves(p, detail, intel, moves);
  const moveSet = new Set(names);
  const moveObjs = names.map((k) => moves[k]).filter((m): m is Move => !!m);
  const role = statRole(p.baseStats);
  const bias = offensiveBias(p, intel);
  const ability = abilityOf(p, detail, intel);
  const item = itemOf(detail, intel);
  const b = p.baseStats;

  const hasAttack = moveObjs.some((m) => m.category !== 'Status' && (m.power ?? 0) > 0)
    || (source === 'none' && Math.max(b.atk, b.spa) >= 60);
  const hasRecovery = names.some((k) => RECOVERY_MOVES.has(k))
    || moveObjs.some((m) => m.flags?.includes('heal'));
  const hasPriority = moveObjs.some((m) => (m.priority ?? 0) > 0 && m.category !== 'Status');
  const hasTrickRoom = moveSet.has('trickroom');
  const bulky = role === 'bulk' || b.hp + b.def + b.spd >= 280;

  const has = (s: Set<string>) => names.some((k) => s.has(k));

  const tags = new Set<RoleTag>();

  if (has(HAZARD_MOVES)) tags.add('hazard-setter');
  if (has(HAZARD_CONTROL)) tags.add('hazard-control');

  if (hasAttack) {
    if (role === 'mixed') {
      tags.add('physical-attacker');
      tags.add('special-attacker');
    } else if (bias === 'physical') {
      tags.add('physical-attacker');
    } else {
      tags.add('special-attacker');
    }
  }

  const offensive = role !== 'bulk' || Math.max(b.atk, b.spa) >= 90;
  if (has(SETUP_MOVES) && offensive) tags.add('setup-sweeper');

  // Choice Scarf turns a fast mon into a revenge killer; a priority attack does
  // it at any speed.
  if ((item === 'choicescarf' && b.spe >= 95) || hasPriority) tags.add('revenge-killer');

  // Wall needs confirmed sustain (recovery/regen) - frail-bulky stats alone don't qualify.
  if (bulky && (hasRecovery || ability === 'regenerator')) tags.add('wall');

  if (has(PIVOT_MOVES) || PIVOT_ABILITIES.has(ability)) tags.add('pivot');

  if (has(CLERIC_MOVES) || has(STATUS_SPREAD)) tags.add('cleric');

  if (has(SPEED_CONTROL_MOVES) || hasPriority || b.spe >= 110 || hasTrickRoom) {
    tags.add('speed-control');
  }

  return {
    id: p.id,
    p,
    tags: ROLE_ORDER.filter((r) => tags.has(r)),
    bias,
    moveSource: source,
    effectiveMoves: names,
  };
}

export interface RoleSlotInput {
  p: Pokemon;
  detail: MemberDetail | null;
}

export function classifyTeam(
  slots: RoleSlotInput[],
  intelBy: (id: string) => SmogonSpeciesIntel | null,
  moves: Record<string, Move>,
): MemberRoles[] {
  return slots.map((s) => classifyMember(s.p, s.detail, intelBy(s.p.id), moves));
}
