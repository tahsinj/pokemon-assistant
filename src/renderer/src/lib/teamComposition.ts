/**
 * Team-composition audit for the Team Builder: turns per-mon roles into a
 * functional-role checklist, a prioritized list of gaps ("you're missing a
 * LEAD!"), and role-targeted fill suggestions drawn from the PC (then the dex).
 *
 * Pure - composes `teamRoles` + the existing weakness/synergy/legality helpers.
 */
import type { Move, Pokemon } from './types';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';
import { effectiveness } from './typechart';
import { massiveSharedWeaknesses } from './teamWeaknessSummary';
import { suggestTeammates } from './teamSynergy';
import { isSuggestableTeammate } from './legality';
import { bst } from './stats';
import {
  classifyMember,
  classifyTeam,
  type MemberRoles,
  type RoleTag,
  type RoleSlotInput,
} from './teamRoles';

export type Severity = 'critical' | 'warning' | 'info';

export interface CompositionGap {
  id: string;
  severity: Severity;
  message: string;
  /** Role a fill suggestion should target; null = nothing to add (e.g. redundancy). */
  fillRole: RoleTag | null;
  /** Types behind a weakness-keyed insight (for tooltip/context). */
  relatedTypes?: string[];
}

export interface RoleChecklistRow {
  role: RoleTag;
  label: string;
  present: boolean;
  filledBy: string[];
}

export interface RoleSuggestion {
  p: Pokemon;
  source: 'pc' | 'dex';
  reason: string;
  score: number;
}

export interface CompositionAudit {
  members: MemberRoles[];
  checklist: RoleChecklistRow[];
  gaps: CompositionGap[];
}

/** Roles shown in the checklist, with display labels. */
const CHECKLIST: { role: RoleTag; label: string }[] = [
  { role: 'hazard-setter', label: 'Lead / Hazards' },
  { role: 'hazard-control', label: 'Hazard control' },
  { role: 'physical-attacker', label: 'Physical attacker' },
  { role: 'special-attacker', label: 'Special attacker' },
  { role: 'setup-sweeper', label: 'Setup sweeper' },
  { role: 'revenge-killer', label: 'Revenge killer' },
  { role: 'wall', label: 'Defensive wall' },
  { role: 'pivot', label: 'Pivot' },
  { role: 'cleric', label: 'Cleric / status' },
  { role: 'speed-control', label: 'Speed control' },
];

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

const SLOW_TIER = 80; // median base speed below this = "slow team"

export function auditTeam(
  slots: RoleSlotInput[],
  intelBy: (id: string) => SmogonSpeciesIntel | null,
  moves: Record<string, Move>,
): CompositionAudit {
  const members = classifyTeam(slots, intelBy, moves);
  const n = members.length;
  const teamMons = members.map((m) => m.p);

  const filledBy = (role: RoleTag): string[] =>
    members.filter((m) => m.tags.includes(role)).map((m) => m.p.name);
  const has = (role: RoleTag) => members.some((m) => m.tags.includes(role));
  const count = (role: RoleTag) => members.filter((m) => m.tags.includes(role)).length;

  const checklist: RoleChecklistRow[] = CHECKLIST.map(({ role, label }) => {
    const names = filledBy(role);
    return { role, label, present: names.length > 0, filledBy: names };
  });

  const physCount = count('physical-attacker');
  const specCount = count('special-attacker');
  const hasRecovery = has('wall'); // wall tag already requires recovery/regen
  const hasTrickRoom = members.some((m) => m.effectiveMoves.includes('trickroom'));

  // Rock-weakness as a Stealth Rock proxy + any 2+ stacked weakness.
  const rockWeak = teamMons.filter((p) => effectiveness('rock', p.types) > 1).length;
  const stackedWeakTypes = massiveSharedWeaknesses(teamMons, 2).map((r) => r.attackType);
  const hazardVulnerable = rockWeak >= 3 || stackedWeakTypes.length > 0;

  const medianSpe = (() => {
    if (!n) return 100;
    const s = teamMons.map((p) => p.baseStats.spe).sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  })();

  const hasBreaker = members.some((m) => bst(m.p.baseStats) >= 500
    && (m.tags.includes('physical-attacker') || m.tags.includes('special-attacker')));

  const gaps: CompositionGap[] = [];
  const push = (g: CompositionGap) => gaps.push(g);

  if (n >= 2 && physCount === 0 && specCount === 0) {
    push({ id: 'no-attacker', severity: 'critical', fillRole: 'physical-attacker',
      message: 'No real attacker - you have no way to actually KO things.' });
  }

  if (!has('hazard-control') && hazardVulnerable) {
    const types = stackedWeakTypes.length ? stackedWeakTypes : ['rock'];
    push({ id: 'hazard-weak-no-control', severity: 'critical', fillRole: 'hazard-control',
      relatedTypes: types,
      message: 'No hazard removal and your team is hazard-weak - pack a Rapid Spin / Defog user or you’ll bleed on every switch.' });
  }

  if (n >= 3 && !has('hazard-setter')) {
    push({ id: 'no-hazard-setter', severity: 'warning', fillRole: 'hazard-setter',
      message: 'You’re missing a LEAD - no hazard setter. Add a Stealth Rock / Spikes user to chip switch-ins.' });
  }

  if (specCount === 0 && physCount >= 1) {
    push({ id: 'no-special-attacker', severity: 'warning', fillRole: 'special-attacker',
      message: `All ${physCount} of your attackers are physical - add a special attacker so one physical wall doesn’t blank you.` });
  } else if (physCount === 0 && specCount >= 1) {
    push({ id: 'no-physical-attacker', severity: 'warning', fillRole: 'physical-attacker',
      message: 'Your offense is all special - add a physical attacker to punish specially-bulky walls.' });
  }

  if (n >= 3 && !has('speed-control') && !has('revenge-killer') && !hasTrickRoom && medianSpe < SLOW_TIER) {
    push({ id: 'no-speed-control', severity: 'warning', fillRole: 'revenge-killer',
      message: 'Slow team, no speed control - add a fast mon, a Choice Scarf user, priority, or Trick Room.' });
  }

  if (n >= 4 && !hasRecovery) {
    push({ id: 'no-defensive-backbone', severity: 'warning', fillRole: 'wall',
      message: 'No defensive backbone - every mon is frail. Add a bulky wall with reliable recovery.' });
  }

  if (n >= 3 && !has('setup-sweeper') && !hasBreaker) {
    push({ id: 'no-win-condition', severity: 'warning', fillRole: 'setup-sweeper',
      message: 'No clear win condition - no setup sweeper or strong wallbreaker to close games.' });
  }

  if (n >= 4 && !has('pivot')) {
    push({ id: 'no-pivot', severity: 'info', fillRole: 'pivot',
      message: 'No pivot - U-turn / Volt Switch / Regenerator keeps momentum and eases switch-ins.' });
  }

  if (count('setup-sweeper') >= 4) {
    push({ id: 'redundant-setup', severity: 'info', fillRole: null,
      message: `${count('setup-sweeper')} setup sweepers is win-condition overload - trade one for a wall or pivot.` });
  }
  if (count('hazard-setter') >= 3) {
    push({ id: 'redundant-hazard', severity: 'info', fillRole: null,
      message: `${count('hazard-setter')} hazard setters is redundant - one Stealth Rock user is usually enough.` });
  }

  gaps.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  return { members, checklist, gaps };
}

/**
 * Candidates that fill a missing role: PC mons first, topped up from the dex.
 * Scored by the teammate synergy scorer plus a role-fit tiebreak.
 */
export function suggestForGap(
  gap: CompositionGap,
  teamMons: Pokemon[],
  pcMons: Pokemon[],
  dex: Pokemon[],
  smogon: SmogonBundle | null,
  moves: Record<string, Move>,
  intelBy: (id: string) => SmogonSpeciesIntel | null,
  limit = 3,
): RoleSuggestion[] {
  const role = gap.fillRole;
  if (!role) return [];

  const onTeam = new Set(teamMons.map((p) => p.id));
  const fills = (p: Pokemon) =>
    classifyMember(p, null, intelBy(p.id), moves).tags.includes(role);

  const pcPool = dedupe(pcMons).filter((p) => !onTeam.has(p.id) && fills(p));
  const pcIds = new Set(pcPool.map((p) => p.id));
  const dexPool = dex.filter(
    (p) => !onTeam.has(p.id) && !pcIds.has(p.id) && isSuggestableTeammate(p) && fills(p),
  );

  const score = (pool: Pokemon[], source: 'pc' | 'dex'): RoleSuggestion[] => {
    const ranked = suggestTeammates(teamMons, pool, smogon, pool.length);
    const byId = new Map(ranked.map((r) => [r.p.id, r]));
    return pool.map((p) => {
      const r = byId.get(p.id);
      const base = r?.score ?? 0;
      const fit = roleFit(role, p);
      const synergyReason = r?.reasons?.[0];
      const reason = `${source === 'pc' ? 'From your PC' : 'Consider'} · fills ${roleLabel(role)}`
        + (synergyReason ? ` · ${synergyReason}` : '');
      return { p, source, reason, score: base + fit };
    });
  };

  const pc = score(pcPool, 'pc').sort((a, b) => b.score - a.score);
  if (pc.length >= limit) return pc.slice(0, limit);
  const dexS = score(dexPool, 'dex').sort((a, b) => b.score - a.score);
  return [...pc, ...dexS].slice(0, limit);
}

function roleFit(role: RoleTag, p: Pokemon): number {
  const b = p.baseStats;
  if (role === 'revenge-killer' || role === 'speed-control') return Math.min(0.4, b.spe / 200);
  if (role === 'wall') return Math.min(0.4, (b.hp + b.def + b.spd) / 600);
  if (role === 'physical-attacker') return Math.min(0.4, b.atk / 400);
  if (role === 'special-attacker') return Math.min(0.4, b.spa / 400);
  return 0.2;
}

function roleLabel(role: RoleTag): string {
  return CHECKLIST.find((c) => c.role === role)?.label.toUpperCase() ?? role.toUpperCase();
}

function dedupe(mons: Pokemon[]): Pokemon[] {
  const seen = new Set<string>();
  const out: Pokemon[] = [];
  for (const p of mons) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}
