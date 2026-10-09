/**
 * Level 2: a one-ply search on the real simulator with a calc-based second
 * ply. The foe's hidden sets are never read: each search runs on copies of
 * the battle where they are drawn from the set predictor (`determinize.ts`).
 * In each copy, every candidate action is played against the foe's likeliest
 * replies, then the next exchange is estimated with the calc, and the
 * resulting positions are scored. An action's value blends its worst reply
 * and its average reply.
 */
import type { Battle, Pokemon as SimPokemon } from '@pkmn/sim';
import { Dex } from '@pkmn/sim';
import { seedFrom, type Engine } from '../engine';
import type { BattleRequest, SideId } from '../types';
import { foeOf, type Bot } from './bot';
import { greedyBot, moveValue } from './greedy';
import { legalChoices, seededRandom } from './random';
import { calcDamage } from '../../lib/battle/damage';
import type { CandidateSet, PredictorContext } from '../../lib/battle/predictor/types';
import { createSetTracker, type SetTracker, type SetTracking } from '../setTracker';
import { determinize } from './determinize';
import { engineContext } from './setPool';
import { fieldFor, ownSpec } from './view';

export interface SearchOptions {
  /** Copies of the battle with the foe's hidden sets drawn from the predictor. */
  worlds: number;
  /** Random-roll samples per joint action in each copy. */
  samples: number;
  /** Foe replies considered per action (its best moves by damage, plus its best switch). */
  replies: number;
}

const DEFAULTS: SearchOptions = { worlds: 2, samples: 1, replies: 3 };

type HpOverride = Map<SimPokemon, number>;

/** Position value for `side`: Pokémon left, weighted by HP, minus the foe's. A win or loss dominates. */
export function evaluate(battle: Battle, side: SideId, hp?: HpOverride): number {
  if (battle.ended) {
    if (!battle.winner) return 0;
    return battle.winner === battle[side].name ? 100 : -100;
  }
  const value = (s: SideId) =>
    battle[s].pokemon.reduce((t, p) => {
      const left = hp?.get(p) ?? (p.fainted ? 0 : p.hp / p.maxhp);
      return t + (left <= 0 ? 0 : 0.4 + 0.6 * left);
    }, 0);
  return value(side) - value(foeOf(side));
}

/** The attacker's most damaging usable move against `target`: share of its max HP taken, and the move's priority. */
function bestHit(battle: Battle, attackerSide: SideId, attacker: SimPokemon, target: SimPokemon): { share: number; priority: number } {
  const atk = ownSpec(attacker);
  const def = ownSpec(target);
  const field = fieldFor(battle, attackerSide);
  let best = { share: 0, priority: 0, value: -1 };
  for (const slot of attacker.moveSlots) {
    if (slot.disabled || slot.pp <= 0) continue;
    const d = calcDamage(9, atk, def, slot.move, field);
    const value = moveValue(d, def.currentHPPercent ?? 100);
    if (value > best.value) {
      const share = d.error || d.isZero ? 0 : (d.pctMin + d.pctMax) / 200;
      best = { share, priority: Dex.moves.get(slot.id).priority, value };
    }
  }
  return best;
}

/**
 * The calc's guess at the next turn: both actives use their most damaging
 * move, faster one first, and a KO stops the other's hit. Returns the
 * position value after it (a speed tie averages both orders).
 */
export function lookahead(battle: Battle, side: SideId): number {
  const foe = foeOf(side);
  const me = battle[side].active[0];
  const them = battle[foe].active[0];
  if (battle.ended || !me || !them || me.fainted || them.fainted) return evaluate(battle, side);
  const mine = bestHit(battle, side, me, them);
  const theirs = bestHit(battle, foe, them, me);
  const trickRoom = !!battle.field.pseudoWeather.trickroom;
  const order = (): number => {
    if (mine.priority !== theirs.priority) return mine.priority > theirs.priority ? 1 : 0;
    const a = me.getStat('spe');
    const b = them.getStat('spe');
    if (a === b) return 0.5;
    return a > b !== trickRoom ? 1 : 0;
  };
  const exchange = (meFirst: boolean): number => {
    let myHp = me.hp / me.maxhp;
    let theirHp = them.hp / them.maxhp;
    if (meFirst) {
      theirHp -= mine.share;
      if (theirHp > 0) myHp -= theirs.share;
    } else {
      myHp -= theirs.share;
      if (myHp > 0) theirHp -= mine.share;
    }
    return evaluate(battle, side, new Map([[me, myHp], [them, theirHp]]));
  };
  const p = order();
  return p === 1 ? exchange(true) : p === 0 ? exchange(false) : (exchange(true) + exchange(false)) / 2;
}

/** Score a move choice cheaply, to rank and prune options. */
function quickScore(battle: Battle, side: SideId, moveSlot: { move: string } | undefined): number {
  const me = battle[side].active[0];
  const them = battle[foeOf(side)].active[0];
  if (!me || !them || !moveSlot) return 0;
  const def = ownSpec(them);
  const d = calcDamage(9, ownSpec(me), def, moveSlot.move, fieldFor(battle, side));
  return moveValue(d, def.currentHPPercent ?? 100);
}

/** The foe's plausible replies in a determinized copy: its best moves and its best switch. */
export function foeReplies(world: Engine, side: SideId, n: number): string[] {
  const foe = foeOf(side);
  const req = world.request(foe);
  if (!req || req.wait || !req.active) return ['default'];
  const mon = world.battle[foe].active[0];
  if (!mon) return ['default'];
  const ranked = mon.moveSlots
    .map((slot, i) => ({ slot, i }))
    .filter(({ slot }) => !slot.disabled && slot.pp > 0)
    .map(({ slot, i }) => ({ c: `move ${i + 1}`, v: quickScore(world.battle, foe, slot) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, Math.max(1, n - 1))
    .map((x) => x.c);
  const bestSwitch = req.active[0]?.trapped ? 'default' : greedyBot.choose(world, foe, { ...req, forceSwitch: [true] });
  const out = bestSwitch.startsWith('switch') ? [...ranked, bestSwitch] : ranked;
  return out.length ? out : ['default'];
}

/** Our candidate actions: every move, Tera only on the best move, every switch. */
export function candidates(engine: Engine, side: SideId, req: BattleRequest): string[] {
  const all = legalChoices(req);
  const plain = all.filter((c) => !c.endsWith('terastallize'));
  const teras = all.filter((c) => c.endsWith('terastallize'));
  if (!teras.length) return plain;
  const moves = req.active?.[0]?.moves ?? [];
  const best = plain
    .filter((c) => c.startsWith('move'))
    .map((c) => ({ c, v: quickScore(engine.battle, side, moves[Number(c.split(' ')[1]) - 1]) }))
    .sort((a, b) => b.v - a.v)[0];
  return best ? [...plain, `${best.c} terastallize`] : plain;
}

export interface RankedAction {
  choice: string;
  /** Expected position value after the turn (see `evaluate`), higher is better. */
  score: number;
  /** The foe's reply that did this action the most harm ("Earthquake", "switch to Gholdengo"). */
  worstReply?: string;
}

/** A foe choice in words, read from the copy it was played in. */
function replyLabel(world: Engine, foe: SideId, reply: string): string {
  const [kind, n] = reply.split(' ');
  const side = world.battle[foe];
  if (kind === 'switch') return `switch to ${side.pokemon[Number(n) - 1]?.name ?? 'another Pokémon'}`;
  if (kind === 'move') return side.active[0]?.moveSlots[Number(n) - 1]?.move ?? reply;
  return 'its default choice';
}

let rollCounter = 0;

/**
 * Every candidate action for `side`, best first. Empty when there is no
 * turn decision to make. `view` is the side's tracked view of the battle;
 * the search plays in copies where the foe's hidden sets come from it.
 */
export function rankActions(
  engine: Engine,
  side: SideId,
  req: BattleRequest,
  view: SetTracking,
  options: Partial<SearchOptions> = {},
): RankedAction[] {
  if (req.teamPreview || req.forceSwitch?.[0] || !req.active || req.wait) return [];
  const o = { ...DEFAULTS, ...options };
  const foe = foeOf(side);
  const mine = candidates(engine, side, req);
  const totals = new Map<string, { sum: number; worlds: number; worstReply?: string }>();
  for (let w = 0; w < o.worlds; w++) {
    const world = engine.clone();
    determinize(world, view, foe, seededRandom(++rollCounter));
    const replies = foeReplies(world, side, o.replies);
    for (const action of mine) {
      const perReply: number[] = [];
      for (const reply of replies) {
        let total = 0;
        for (let k = 0; k < o.samples; k++) {
          const c = world.clone();
          c.battle.resetRNG(seedFrom(++rollCounter));
          // Search must not see a choice the foe already made.
          c.battle[foe].clearChoice();
          c.battle[side].clearChoice();
          if (!c.choose(side, action)) {
            total = -Infinity;
            break;
          }
          if (c.needsChoice(foe) && !c.choose(foe, reply)) c.choose(foe, 'default');
          total += 0.5 * evaluate(c.battle, side) + 0.5 * lookahead(c.battle, side);
        }
        perReply.push(total / o.samples);
      }
      const worst = Math.min(...perReply);
      const mean = perReply.reduce((x, y) => x + y, 0) / perReply.length;
      if (!Number.isFinite(worst)) continue;
      const t = totals.get(action) ?? { sum: 0, worlds: 0 };
      t.sum += 0.5 * worst + 0.5 * mean;
      t.worlds++;
      t.worstReply ??= replyLabel(world, foe, replies[perReply.indexOf(worst)]);
      totals.set(action, t);
    }
  }
  return [...totals]
    .map(([choice, t]) => ({ choice, score: t.sum / t.worlds, worstReply: t.worstReply }))
    .sort((x, y) => y.score - x.score);
}

/** Keeps one set tracker per battle and side, so each decision only reads the new lines. */
export function viewKeeper(ctx: PredictorContext) {
  const trackers = new WeakMap<Engine, Partial<Record<SideId, SetTracker>>>();
  return (engine: Engine, side: SideId): SetTracking => {
    const bySide = trackers.get(engine) ?? {};
    trackers.set(engine, bySide);
    bySide[side] ??= createSetTracker(side, ctx, engine.battle[side].pokemon.map((p) => p.set));
    return bySide[side].update(engine.linesFor(side));
  };
}

export function searchBot(options: Partial<SearchOptions> = {}, setPool?: Record<string, CandidateSet[]>): Bot {
  const viewOf = viewKeeper(engineContext(setPool));
  return {
    level: 2,
    name: 'Search',
    choose(engine, side, req) {
      if (req.teamPreview || req.forceSwitch?.[0] || !req.active || req.wait) return greedyBot.choose(engine, side, req);
      const ranked = rankActions(engine, side, req, viewOf(engine, side), options);
      return ranked[0]?.choice ?? greedyBot.choose(engine, side, req);
    },
  };
}
