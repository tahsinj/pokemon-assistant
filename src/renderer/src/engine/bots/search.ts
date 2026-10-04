/**
 * Level 2: a one-ply search on the real simulator. Each candidate action is
 * played against the foe's likeliest replies, a few times with different
 * random rolls, and the resulting positions are scored. An action's value
 * blends its worst reply and its average reply.
 *
 * Known limit: the foe's replies come from its real request, narrowed to
 * moves it has already used once any are revealed. Sampling hidden sets
 * from the set predictor instead is follow-up work (WORKPLAN.md, M6).
 */
import type { Battle } from '@pkmn/sim';
import { seedFrom, type Engine } from '../engine';
import type { BattleRequest, SideId } from '../types';
import { foeOf, type Bot } from './bot';
import { greedyBot, moveValue } from './greedy';
import { legalChoices } from './random';
import { calcDamage } from '../../lib/battle/damage';
import { fieldFor, foeSpec, ownSpec } from './view';

export interface SearchOptions {
  /** Random-roll samples per joint action. */
  samples: number;
  /** Foe replies considered per action (its best moves by damage, plus its best switch). */
  replies: number;
}

const DEFAULTS: SearchOptions = { samples: 2, replies: 3 };

/** Position value for `side`: Pokémon left, weighted by HP, minus the foe's. A win or loss dominates. */
export function evaluate(battle: Battle, side: SideId): number {
  if (battle.ended) {
    if (!battle.winner) return 0;
    return battle.winner === battle[side].name ? 100 : -100;
  }
  const value = (s: SideId) =>
    battle[s].pokemon.reduce((t, p) => t + (p.fainted || p.hp <= 0 ? 0 : 0.4 + (0.6 * p.hp) / p.maxhp), 0);
  return value(side) - value(foeOf(side));
}

/** Score a move choice cheaply from `side`'s view, to rank and prune options. */
function quickScore(engine: Engine, side: SideId, req: BattleRequest, choice: string, asFoe: boolean): number {
  const m = /^move (\d)/.exec(choice);
  if (!m) return -1;
  const me = engine.battle[side].active[0];
  const them = engine.battle[foeOf(side)].active[0];
  const slot = req.active?.[0]?.moves[Number(m[1]) - 1];
  if (!me || !them || !slot) return 0;
  // From the foe's seat, its own set is known and ours is public info only.
  const atk = ownSpec(me);
  const def = asFoe ? ownSpec(them) : foeSpec(them);
  const d = calcDamage(9, atk, def, slot.move, fieldFor(engine.battle, side));
  return moveValue(d, def.currentHPPercent ?? 100);
}

/** The foe's plausible replies: its best moves (revealed ones once any are) and its best switch. */
function foeReplies(engine: Engine, side: SideId, n: number): string[] {
  const foe = foeOf(side);
  const req = engine.request(foe);
  if (!req || req.wait) return ['default'];
  const all = legalChoices(req).filter((c) => !c.endsWith('terastallize'));
  const foeMon = engine.battle[foe].active[0];
  const revealed = new Set<string>(foeMon?.moveSlots.filter((s) => s.used).map((s) => s.id));
  const moves = all
    .filter((c) => c.startsWith('move'))
    .filter((c) => !revealed.size || revealed.has(req.active?.[0]?.moves[Number(c.split(' ')[1]) - 1]?.id ?? ''));
  const ranked = moves
    .map((c) => ({ c, v: quickScore(engine, foe, req, c, true) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map((x) => x.c);
  const bestSwitch = greedyBot.choose(engine, foe, { ...req, forceSwitch: [true] });
  const out = bestSwitch.startsWith('switch') ? [...ranked, bestSwitch] : ranked;
  return out.length ? out : ['default'];
}

/** Our candidate actions: every move, Tera only on the best move, every switch. */
function candidates(engine: Engine, side: SideId, req: BattleRequest): string[] {
  const all = legalChoices(req);
  const plain = all.filter((c) => !c.endsWith('terastallize'));
  const teras = all.filter((c) => c.endsWith('terastallize'));
  if (!teras.length) return plain;
  const best = plain
    .filter((c) => c.startsWith('move'))
    .map((c) => ({ c, v: quickScore(engine, side, req, c, false) }))
    .sort((a, b) => b.v - a.v)[0];
  return best ? [...plain, `${best.c} terastallize`] : plain;
}

export interface RankedAction {
  choice: string;
  /** Expected position value after the turn (see `evaluate`), higher is better. */
  score: number;
}

let rollCounter = 0;

/** Every candidate action for `side`, best first. Empty when there is no turn decision to make. */
export function rankActions(engine: Engine, side: SideId, req: BattleRequest, options: Partial<SearchOptions> = {}): RankedAction[] {
  if (req.teamPreview || req.forceSwitch?.[0] || !req.active || req.wait) return [];
  const o = { ...DEFAULTS, ...options };
  const foe = foeOf(side);
  const mine = candidates(engine, side, req);
  const replies = foeReplies(engine, side, o.replies);
  const ranked: RankedAction[] = [];
  for (const action of mine) {
    const perReply: number[] = [];
    for (const reply of replies) {
      let total = 0;
      for (let k = 0; k < o.samples; k++) {
        const c = engine.clone();
        c.battle.resetRNG(seedFrom(++rollCounter));
        // Search must not see a choice the foe already made.
        c.battle[foe].clearChoice();
        c.battle[side].clearChoice();
        if (!c.choose(side, action)) {
          total = -Infinity;
          break;
        }
        if (c.needsChoice(foe) && !c.choose(foe, reply)) c.choose(foe, 'default');
        total += evaluate(c.battle, side);
      }
      perReply.push(total / o.samples);
    }
    const worst = Math.min(...perReply);
    const mean = perReply.reduce((x, y) => x + y, 0) / perReply.length;
    if (Number.isFinite(worst)) ranked.push({ choice: action, score: 0.5 * worst + 0.5 * mean });
  }
  return ranked.sort((x, y) => y.score - x.score);
}

export function searchBot(options: Partial<SearchOptions> = {}): Bot {
  return {
    level: 2,
    name: 'Search',
    choose(engine, side, req) {
      const ranked = rankActions(engine, side, req, options);
      return ranked[0]?.choice ?? greedyBot.choose(engine, side, req);
    },
  };
}
