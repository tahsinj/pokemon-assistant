/**
 * A practice battle: the player is p1, a bot is p2. The bot answers as soon
 * as it has a request, before seeing the player's choice. One snapshot per
 * turn (taken before the bot chooses) backs "take back".
 */
import { Engine, randomTeam, seedFrom } from './engine';
import { greedyBot } from './bots/greedy';
import { randomBot } from './bots/random';
import { evaluate, rankActions, searchBot, viewKeeper } from './bots/search';
import { engineContext } from './bots/setPool';
import type { Bot } from './bots/bot';
import type { CandidateSet } from '../lib/battle/predictor/types';
import type { SetTracking } from './setTracker';
import type { BattleRequest, SideId } from './types';

export type BotLevel = 0 | 1 | 2;

export const BOT_NAMES: Record<BotLevel, string> = { 0: 'Random', 1: 'Greedy', 2: 'Search' };

/** One suggested action from the hint button. */
export interface Hint {
  choice: string;
  /** "Earthquake", "Earthquake + Tera", "Switch to Corviknight". */
  label: string;
  /** Position value after the turn, from your side; see `evaluate`. */
  score: number;
}

export interface SessionOptions {
  format: string;
  /** Showdown export or packed; empty means a random battle team. */
  playerTeam?: string;
  botTeam?: string;
  botLevel: BotLevel;
  seed?: number;
  playerName?: string;
  /** Usage-based sets for the format, by species id, as prior guesses at hidden sets. */
  setPool?: Record<string, CandidateSet[]>;
}

export interface SessionView {
  /** Everything the player has seen, from the start of the battle. */
  lines: string[];
  request: BattleRequest | null;
  ended: boolean;
  /** "player", "bot" or "tie" once the battle is over. */
  result?: 'player' | 'bot' | 'tie';
  turn: number;
  canUndo: boolean;
  botName: string;
  /** Why the last choice was rejected. */
  error?: string;
  /** Position value from your side at the start of each turn, for the eval graph. */
  evals: number[];
}

function makeBot(level: BotLevel, seed: number, setPool?: Record<string, CandidateSet[]>): Bot {
  return level === 0 ? randomBot(seed) : level === 1 ? greedyBot : searchBot({}, setPool);
}

export class PracticeSession {
  private engine: Engine;
  private readonly bot: Bot;
  private readonly playerName: string;
  /** Your view of the battle, so hints never use the bot's hidden sets. */
  private readonly viewOf: (engine: Engine, side: SideId) => SetTracking;
  /** Engine copies at each of the player's turn decisions, oldest first. */
  private snapshots: Engine[] = [];
  private error?: string;
  /** evals[t] is the position value at the start of turn t + 1. */
  private evals: number[] = [];

  constructor(o: SessionOptions) {
    const seed = o.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.bot = makeBot(o.botLevel, seed, o.setPool);
    this.viewOf = viewKeeper(engineContext(o.setPool));
    this.playerName = o.playerName ?? 'You';
    const team = (t: string | undefined, n: number) => (t?.trim() ? t : randomTeam('gen9randombattle', seedFrom(seed + n)));
    this.engine = Engine.start({
      format: o.format,
      seed: seedFrom(seed),
      p1: { name: this.playerName, team: team(o.playerTeam, 1) },
      p2: { name: this.bot.name, team: team(o.botTeam, 2) },
    });
    this.advance();
  }

  /** Let the bot answer every request it has, snapshotting before each new player turn. */
  private advance(): void {
    for (let guard = 0; guard < 50 && !this.engine.ended; guard++) {
      const req = this.engine.request('p1');
      const turnStart = this.engine.needsChoice('p1') && !!req?.active && !req.forceSwitch;
      const last = this.snapshots[this.snapshots.length - 1];
      if (turnStart && (!last || last.turn !== this.engine.turn)) {
        this.snapshots.push(this.engine.clone());
        this.evals = this.evals.slice(0, Math.max(0, this.engine.turn - 1));
        this.evals.push(evaluate(this.engine.battle, 'p1'));
      }
      if (!this.engine.needsChoice('p2')) return;
      const choice = this.bot.choose(this.engine, 'p2', this.engine.request('p2')!);
      if (!this.engine.choose('p2', choice)) this.engine.choose('p2', 'default');
    }
  }

  choose(choice: string): SessionView {
    this.error = undefined;
    if (!this.engine.needsChoice('p1')) {
      this.error = 'Waiting for the other side.';
    } else if (!this.engine.choose('p1', choice)) {
      this.error = this.engine.errors.p1 ?? `"${choice}" is not a legal choice.`;
    } else {
      this.advance();
    }
    return this.view();
  }

  /** Go back to the start of the previous turn (or this turn's start once the battle ended). */
  undo(): SessionView {
    if (!this.engine.ended) this.snapshots.pop();
    const prev = this.snapshots.pop();
    if (prev) {
      this.engine = prev.clone();
      this.error = undefined;
      this.advance();
    }
    return this.view();
  }

  view(): SessionView {
    const e = this.engine;
    const winner = e.winner;
    return {
      lines: e.linesFor('p1'),
      request: e.ended ? null : e.request('p1'),
      ended: e.ended,
      result: !e.ended ? undefined : winner === this.playerName ? 'player' : winner ? 'bot' : 'tie',
      turn: e.turn,
      canUndo: this.snapshots.length >= (e.ended ? 1 : 2),
      botName: this.bot.name,
      error: this.error,
      evals: e.ended ? [...this.evals, evaluate(e.battle, 'p1')] : this.evals,
    };
  }

  /** The search bot's three best actions for you this turn. */
  hint(): Hint[] {
    const req = this.engine.request('p1');
    if (!req || !this.engine.needsChoice('p1')) return [];
    const team = req.side.pokemon;
    const label = (choice: string) => {
      const [kind, n, tera] = choice.split(' ');
      if (kind === 'switch') return `Switch to ${team[Number(n) - 1]?.details.split(',')[0] ?? n}`;
      const move = req.active?.[0]?.moves[Number(n) - 1]?.move ?? choice;
      return tera ? `${move} + Tera` : move;
    };
    return rankActions(this.engine, 'p1', req, this.viewOf(this.engine, 'p1'))
      .slice(0, 3)
      .map((r) => ({ choice: r.choice, label: label(r.choice), score: r.score }));
  }

  /** The battle as a spectator saw it, for saving as a replay log. */
  exportLog(): string {
    return this.engine.linesFor('spectator').join('\n');
  }
}
