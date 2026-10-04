/**
 * The Showdown simulator behind a small synchronous API. Practice battles,
 * bots and replay review all drive battles through this; it has no DOM, so
 * tests and Node scripts use it directly and the worker wraps it.
 */
import { Battle, PRNG, State, Teams, TeamValidator, extractChannelMessages, toID, type PRNGSeed } from '@pkmn/sim';
import { TeamGenerators } from '@pkmn/randoms';
import type { BattleRequest, SideId } from './types';

let generatorsReady = false;
function enableRandomTeams(): void {
  if (generatorsReady) return;
  Teams.setGeneratorFactory(TeamGenerators);
  generatorsReady = true;
}

/** A team as Showdown export text, or packed. Empty means "generate one" (random formats only). */
export interface PlayerSpec {
  name: string;
  team?: string;
}

export interface StartOptions {
  format: string;
  /** Same seed and choices give the same battle. */
  seed?: PRNGSeed;
  p1: PlayerSpec;
  p2: PlayerSpec;
}

/** A deterministic seed from a number, for tests and reproducible games. */
export function seedFrom(n: number): PRNGSeed {
  return PRNG.convertSeed([n & 0xffff, (n >>> 16) & 0xffff, 0x5ab1, 0x1ab0]);
}

/** Showdown export text or packed team to packed form; null when it doesn't parse. */
export function packTeam(team: string): string | null {
  const text = team.trim();
  if (!text) return null;
  // Packed teams have no newlines and use | between fields.
  if (!text.includes('\n') && text.includes('|')) return text;
  const sets = Teams.import(text);
  return sets?.length ? Teams.pack(sets) : null;
}

/** Problems that make a team illegal in a format; empty when it is legal. */
export function validateTeam(format: string, team: string): string[] {
  const packed = packTeam(team);
  if (!packed) return ['The team could not be read.'];
  return TeamValidator.get(format).validateTeam(Teams.unpack(packed)) ?? [];
}

/** Generate a team for a format with a random team generator (e.g. gen9randombattle). */
export function randomTeam(format: string, seed?: PRNGSeed): string {
  enableRandomTeams();
  return Teams.pack(Teams.generate(format, seed ? { seed } : null));
}

export class Engine {
  /** The sim's last "[Invalid choice]" message per side. */
  readonly errors: Partial<Record<SideId, string>> = {};

  private constructor(readonly battle: Battle) {
    // The sim reports rejected choices through its output callback.
    Object.assign(battle, {
      send: (type: string, data: string | string[]) => {
        if (type !== 'sideupdate') return;
        const [side, ...lines] = (Array.isArray(data) ? data.join('\n') : data).split('\n');
        const error = lines.find((l) => l.startsWith('|error|'));
        if (error && (side === 'p1' || side === 'p2')) this.errors[side] = error.slice('|error|'.length);
      },
    });
  }

  static start(o: StartOptions): Engine {
    enableRandomTeams();
    const player = (p: PlayerSpec) => ({ name: p.name, team: p.team ? packTeam(p.team) ?? undefined : undefined });
    return new Engine(new Battle({ formatid: toID(o.format), seed: o.seed, p1: player(o.p1), p2: player(o.p2) }));
  }

  /** What the side has to decide now, or null once the battle is over. */
  request(side: SideId): BattleRequest | null {
    return (this.battle[side].activeRequest as BattleRequest | null) ?? null;
  }

  /** True when the side has a request it hasn't answered yet. */
  needsChoice(side: SideId): boolean {
    const r = this.request(side);
    return !!r && !r.wait && !this.battle[side].isChoiceDone();
  }

  /** Submit a choice ("move 1", "switch 3", "move 2 terastallize", "team 1"). False when the sim rejects it. */
  choose(side: SideId, choice: string): boolean {
    delete this.errors[side];
    return this.battle.choose(side, choice);
  }

  get ended(): boolean {
    return this.battle.ended;
  }

  /** Winner's player name, "" for a tie, undefined while running. */
  get winner(): string | undefined {
    return this.battle.winner;
  }

  get turn(): number {
    return this.battle.turn;
  }

  /** Full protocol log with every player's secret lines (the "omniscient" view). */
  get log(): readonly string[] {
    return this.battle.log;
  }

  /** Inputs that recreate this battle when fed to a fresh simulator. */
  get inputLog(): readonly string[] {
    return this.battle.inputLog;
  }

  /** Protocol lines as one player (or a spectator) sees them, from line `from` of the log. */
  linesFor(view: SideId | 'spectator', from = 0): string[] {
    const channel = view === 'p1' ? 1 : view === 'p2' ? 2 : 0;
    const text = this.battle.log.slice(from).join('\n');
    return extractChannelMessages(text, [channel])[channel].filter((l) => l !== '');
  }

  /** An independent copy for search. Goes through a JSON string; see WORKPLAN.md. */
  clone(): Engine {
    return new Engine(State.deserializeBattle(JSON.stringify(State.serializeBattle(this.battle))));
  }
}

export type Chooser = (side: SideId, request: BattleRequest, engine: Engine) => string | null;

/**
 * Play until the battle ends or `maxDecisions` choices have been made. A
 * rejected choice falls back to "default" so a buggy chooser can't stall.
 */
export function playOut(engine: Engine, chooser: Chooser, maxDecisions = 2000): void {
  for (let n = 0; n < maxDecisions && !engine.ended; ) {
    let chose = false;
    for (const side of ['p1', 'p2'] as const) {
      if (!engine.needsChoice(side)) continue;
      const choice = chooser(side, engine.request(side)!, engine) ?? 'default';
      if (!engine.choose(side, choice)) engine.choose(side, 'default');
      chose = true;
      n++;
      if (engine.ended) break;
    }
    if (!chose) throw new Error('Battle is stuck: no side has a request');
  }
}
