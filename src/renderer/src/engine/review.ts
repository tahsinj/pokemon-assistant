/**
 * Replay review. The quick review uses public information only: for each
 * turn of the reviewed side, compare the move it used with its other
 * revealed moves against the target as it stood at the start of the turn,
 * and flag clear misses. The search review rebuilds each turn in the
 * simulator (`rebuild.ts`) and ranks every option with the search bot.
 */
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import { calcDamage, type DamageOutcome } from '../lib/battle/damage';
import { EMPTY_FIELD, NEUTRAL_IVS, type BattlePokemonSpec } from '../lib/battle/types';
import { moveValue } from './bots/greedy';
import { clientBattle, type ClientBattle } from './clientState';
import { linesUpTo, type Replay } from './replay';
import type { BattleRequest, SideId } from './types';
import { toID } from '@pkmn/sim';
import type { PredictorContext } from '../lib/battle/predictor/types';
import { rankActions } from './bots/search';
import { rebuildAt } from './rebuild';

export interface Flag {
  turn: number;
  text: string;
  /** Expected-value gap in percent of the target's HP; larger is worse. */
  gap: number;
}

const EVEN_EVS = { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 };

function spec(p: ClientPokemon, moves: string[]): BattlePokemonSpec {
  return {
    speciesName: p.speciesForme,
    level: p.level,
    nature: 'Hardy',
    ability: p.ability || undefined,
    item: p.item || undefined,
    teraType: p.terastallized,
    isTerastallized: !!p.terastallized,
    ivs: { ...NEUTRAL_IVS },
    evs: { ...EVEN_EVS },
    moves: moves.map((name) => ({ name })),
    currentHPPercent: p.maxhp ? (100 * p.hp) / p.maxhp : 100,
    boosts: { atk: p.boosts.atk, def: p.boosts.def, spa: p.boosts.spa, spd: p.boosts.spd, spe: p.boosts.spe },
    status: (p.status || undefined) as BattlePokemonSpec['status'],
  };
}

/** Position value for `side` from what spectators can see; unseen Pokémon count as healthy. */
export function publicEval(battle: ClientBattle, side: SideId): number {
  const value = (s: SideId) => {
    const team = battle[s].team;
    const seen = team.reduce((t, p) => t + (p.fainted ? 0 : 0.4 + (0.6 * p.hp) / (p.maxhp || 1)), 0);
    return seen + Math.max(0, (battle[s].totalPokemon || 6) - team.length);
  };
  return value(side) - value(side === 'p1' ? 'p2' : 'p1');
}

const pct = (d: DamageOutcome) => `${Math.round(d.pctMin)}-${Math.round(d.pctMax)}%`;

export function reviewReplay(replay: Replay, side: SideId): Flag[] {
  const final = clientBattle(replay.lines);
  const foe: SideId = side === 'p1' ? 'p2' : 'p1';
  const flags: Flag[] = [];
  for (let turn = 1; turn <= replay.turnStarts.length; turn++) {
    const start = replay.turnStarts[turn - 1];
    const end = replay.turnStarts[turn] ?? replay.lines.length;
    const used = replay.lines.slice(start, end).find((l) => l.startsWith(`|move|${side}a: `));
    if (!used) continue;
    const before = clientBattle(linesUpTo(replay, turn));
    const me = before[side].active[0];
    const target = before[foe].active[0];
    if (!me || !target) continue;
    // Moves this Pokémon revealed over the whole battle.
    const known = final[side].team.find((p) => p.originalIdent === me.originalIdent);
    const moveNames = (known?.moveSlots ?? []).map((m) => m.id as string);
    const chosen = used.split('|')[3];
    if (!moveNames.length) continue;
    const atk = spec(me, moveNames);
    const def = spec(target, []);
    const outcomes = moveNames.map((m) => calcDamage(9, atk, def, m, EMPTY_FIELD));
    const chosenOutcome = calcDamage(9, atk, def, chosen, EMPTY_FIELD);
    if (chosenOutcome.category === 'Status' || chosenOutcome.error) continue;
    const hp = def.currentHPPercent ?? 100;
    const best = outcomes.reduce((a, b) => (moveValue(b, hp) > moveValue(a, hp) ? b : a));
    const gap = moveValue(best, hp) - moveValue(chosenOutcome, hp);
    const bestKos = best.ko.n === 1 && best.ko.chance >= 0.5;
    const chosenKos = chosenOutcome.ko.n === 1 && chosenOutcome.ko.chance >= 0.5;
    if (best.moveName !== chosenOutcome.moveName && (gap >= 25 || (bestKos && !chosenKos))) {
      flags.push({
        turn,
        gap,
        text: `${me.name} used ${chosen} (${chosenOutcome.isZero ? 'no damage' : pct(chosenOutcome)}) on ${target.name}; ${best.moveName} would have done ${pct(best)}${bestKos ? ' and likely KO' : ''}.`,
      });
    }
  }
  return flags;
}

/** Position value at the start of every turn, for the eval graph. */
export function replayEvals(replay: Replay, side: SideId): number[] {
  return replay.turnStarts.map((_, i) => publicEval(clientBattle(linesUpTo(replay, i + 1)), side));
}

/**
 * The action `side` chose at the start of `turn`, as a choice string for the
 * rebuilt battle's request; null when the replay doesn't show a free choice
 * (it couldn't move, or fainted first and was replaced).
 */
export function chosenAction(replay: Replay, turn: number, side: SideId, req: BattleRequest): string | null {
  const start = replay.turnStarts[turn - 1];
  const end = replay.turnStarts[turn] ?? replay.lines.length;
  const window = replay.lines.slice(start, end);
  let tera = false;
  for (const line of window) {
    const parts = line.split('|');
    if (!parts[2]?.startsWith(`${side}a: `)) continue;
    const kind = parts[1];
    if (kind === '-terastallize') tera = true;
    if (kind === 'cant' || kind === 'faint') return null;
    if (kind === 'switch' && !parts.some((x) => x.startsWith('[from]'))) {
      const ident = `${side}: ${parts[2].slice(5)}`;
      const slot = req.side.pokemon.findIndex((p) => p.ident === ident);
      return slot >= 0 && !req.side.pokemon[slot].active ? `switch ${slot + 1}` : null;
    }
    if (kind === 'move' && !parts.some((x) => x.startsWith('[from]'))) {
      const slot = req.active?.[0]?.moves.findIndex((m) => m.id === toID(parts[3])) ?? -1;
      return slot >= 0 ? `move ${slot + 1}${tera ? ' terastallize' : ''}` : null;
    }
  }
  return null;
}

function choiceLabel(choice: string, req: BattleRequest): string {
  const [kind, n, tera] = choice.split(' ');
  if (kind === 'switch') return `switching to ${req.side.pokemon[Number(n) - 1]?.details.split(',')[0] ?? n}`;
  const move = req.active?.[0]?.moves[Number(n) - 1]?.move ?? choice;
  return tera ? `${move} with Tera` : move;
}

/** How far below the search's best a choice must score to be flagged, in Pokémon (see `evaluate`). */
const SEARCH_GAP = 0.3;

/** One turn of the search review: the rebuilt battle, the choice made, and the search's ranking. */
export function searchReviewTurn(replay: Replay, turn: number, side: SideId, ctx: PredictorContext): Flag | null {
  const rebuilt = rebuildAt(replay, turn, side, ctx);
  const req = rebuilt?.engine.request(side);
  if (!rebuilt || !req?.active || req.forceSwitch?.[0]) return null;
  const choice = chosenAction(replay, turn, side, req);
  if (!choice) return null;
  const ranked = rankActions(rebuilt.engine, side, req, rebuilt.view);
  const chosen = ranked.find((r) => r.choice === choice) ?? ranked.find((r) => r.choice === choice.replace(' terastallize', ''));
  const best = ranked[0];
  if (!chosen || !best || best.choice === chosen.choice) return null;
  const gap = best.score - chosen.score;
  if (gap < SEARCH_GAP) return null;
  const me = rebuilt.engine.battle[side].active[0]?.name ?? 'It';
  return {
    turn,
    gap,
    text: `${me}: ${choiceLabel(choice, req)} was played; the search prefers ${choiceLabel(best.choice, req)} (about ${gap.toFixed(1)} Pokémon better).`,
  };
}

/** The search review of every turn. Slow (a search per turn); the page runs it a turn at a time. */
export function searchReview(replay: Replay, side: SideId, ctx: PredictorContext): Flag[] {
  return replay.turnStarts.flatMap((_, i) => searchReviewTurn(replay, i + 1, side, ctx) ?? []);
}
