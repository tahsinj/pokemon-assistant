/**
 * Manual entry for battles played somewhere the app can't read. What the
 * player types becomes Showdown protocol lines ("Garchomp used Earthquake,
 * Rotom fell to 45%"), so the battle opens in the same view and review as a
 * replay. The log is rebuilt from the event list each time, which makes
 * undo a matter of dropping the last event.
 */
import { Dex } from '@pkmn/sim';
import type { SideId } from './types';

export interface ManualSetup {
  format: string;
  names: Record<SideId, string>;
  /** Species, lead first. */
  teams: Record<SideId, string[]>;
}

export type ManualEvent =
  /** The side's active uses a move; `hpAfter` is the target's HP in percent afterwards, when it took damage. */
  | { kind: 'move'; side: SideId; move: string; hpAfter?: number; tera?: string }
  | { kind: 'switch'; side: SideId; species: string }
  /** Damage or healing not from a move (hazards, Leftovers, Life Orb): the active's HP afterwards. */
  | { kind: 'hp'; side: SideId; hpAfter: number; from?: string }
  | { kind: 'status'; side: SideId; status: 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz' }
  | { kind: 'boost'; side: SideId; stat: 'atk' | 'def' | 'spa' | 'spd' | 'spe'; amount: number }
  | { kind: 'endTurn' };

const foe = (s: SideId): SideId => (s === 'p1' ? 'p2' : 'p1');

/** A species name in the simulator's spelling, or null when it isn't one. */
export function speciesName(text: string): string | null {
  const s = Dex.species.get(text.trim());
  return s.exists ? s.name : null;
}

export function moveName(text: string): string | null {
  const m = Dex.moves.get(text.trim());
  return m.exists ? m.name : null;
}

/** Problems with a setup, empty when it can start. */
export function setupProblems(setup: ManualSetup): string[] {
  const out: string[] = [];
  for (const side of ['p1', 'p2'] as const) {
    if (!setup.teams[side].length) out.push(`${setup.names[side]} needs at least one Pokémon.`);
    if (setup.teams[side].length > 6) out.push(`${setup.names[side]} has more than six Pokémon.`);
    for (const s of setup.teams[side]) if (!speciesName(s)) out.push(`"${s}" is not a Pokémon.`);
  }
  return out;
}

interface State {
  active: Record<SideId, string>;
  hp: Record<string, number>;
  fainted: Set<string>;
  turn: number;
}

const key = (side: SideId, species: string) => `${side}:${species}`;
const ident = (side: SideId, species: string) => `${side}a: ${species}`;

/** Why an event can't be added now; null when it can. */
export function eventProblem(setup: ManualSetup, events: ManualEvent[], e: ManualEvent): string | null {
  const st = replay(setup, events).state;
  if (e.kind === 'endTurn') return null;
  if (st.fainted.has(key(e.side, st.active[e.side])) && e.kind !== 'switch') return `${st.active[e.side]} has fainted; switch first.`;
  if (e.kind === 'move' && !moveName(e.move)) return `"${e.move}" is not a move.`;
  if (e.kind === 'switch') {
    const name = speciesName(e.species);
    if (!name || !setup.teams[e.side].some((s) => speciesName(s) === name)) return `${e.species} is not on ${setup.names[e.side]}'s team.`;
    if (name === st.active[e.side] && !st.fainted.has(key(e.side, name))) return `${name} is already in.`;
    if (st.fainted.has(key(e.side, name))) return `${name} has fainted.`;
  }
  return null;
}

function replay(setup: ManualSetup, events: ManualEvent[]): { lines: string[]; state: State } {
  const leads = { p1: speciesName(setup.teams.p1[0]) ?? '', p2: speciesName(setup.teams.p2[0]) ?? '' };
  const lines = [
    `|player|p1|${setup.names.p1}|`,
    `|player|p2|${setup.names.p2}|`,
    `|teamsize|p1|${setup.teams.p1.length}`,
    `|teamsize|p2|${setup.teams.p2.length}`,
    '|gen|9',
    `|tier|${setup.format}`,
    ...(['p1', 'p2'] as const).flatMap((s) => setup.teams[s].map((t) => `|poke|${s}|${speciesName(t) ?? t}|`)),
    '|start',
    `|switch|${ident('p1', leads.p1)}|${leads.p1}|100/100`,
    `|switch|${ident('p2', leads.p2)}|${leads.p2}|100/100`,
    '|turn|1',
  ];
  const st: State = { active: leads, hp: {}, fainted: new Set(), turn: 1 };
  const hpOf = (side: SideId) => st.hp[key(side, st.active[side])] ?? 100;
  const setHp = (side: SideId, hp: number, suffix = '') => {
    const value = Math.max(0, Math.min(100, Math.round(hp)));
    st.hp[key(side, st.active[side])] = value;
    lines.push(`|-damage|${ident(side, st.active[side])}|${value === 0 ? '0 fnt' : `${value}/100`}${suffix}`);
    if (value === 0) {
      lines.push(`|faint|${ident(side, st.active[side])}`);
      st.fainted.add(key(side, st.active[side]));
    }
  };
  for (const e of events) {
    switch (e.kind) {
      case 'move': {
        const target = foe(e.side);
        if (e.tera) lines.push(`|-terastallize|${ident(e.side, st.active[e.side])}|${e.tera}`);
        lines.push(`|move|${ident(e.side, st.active[e.side])}|${moveName(e.move) ?? e.move}|${ident(target, st.active[target])}`);
        if (e.hpAfter != null && e.hpAfter !== hpOf(target)) {
          if (e.hpAfter > hpOf(target)) lines.push(`|-heal|${ident(target, st.active[target])}|${Math.round(e.hpAfter)}/100`);
          else setHp(target, e.hpAfter);
          st.hp[key(target, st.active[target])] = Math.round(e.hpAfter);
        }
        break;
      }
      case 'switch': {
        const name = speciesName(e.species) ?? e.species;
        st.active[e.side] = name;
        lines.push(`|switch|${ident(e.side, name)}|${name}|${hpOf(e.side)}/100`);
        break;
      }
      case 'hp': {
        const from = e.from ? `|[from] ${e.from}` : '';
        if (e.hpAfter >= hpOf(e.side)) {
          st.hp[key(e.side, st.active[e.side])] = Math.round(e.hpAfter);
          lines.push(`|-heal|${ident(e.side, st.active[e.side])}|${Math.round(e.hpAfter)}/100${from}`);
        } else {
          setHp(e.side, e.hpAfter, from);
        }
        break;
      }
      case 'status':
        lines.push(`|-status|${ident(e.side, st.active[e.side])}|${e.status}`);
        break;
      case 'boost':
        lines.push(`|${e.amount >= 0 ? '-boost' : '-unboost'}|${ident(e.side, st.active[e.side])}|${e.stat}|${Math.abs(e.amount)}`);
        break;
      case 'endTurn':
        st.turn++;
        lines.push('|', '|upkeep', `|turn|${st.turn}`);
        break;
    }
  }
  return { lines, state: st };
}

/** The protocol lines for a setup and its events. */
export function manualLines(setup: ManualSetup, events: ManualEvent[]): string[] {
  return replay(setup, events).lines;
}

/** Which Pokémon are in now, as the composer needs to know. */
export function manualActives(setup: ManualSetup, events: ManualEvent[]): Record<SideId, string> {
  return replay(setup, events).state.active;
}
