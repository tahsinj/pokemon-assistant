/**
 * Replay review from public information only: for each turn of the reviewed
 * side, compare the move it used with its other revealed moves against the
 * target as it stood at the start of the turn, and flag clear misses.
 */
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import { calcDamage, type DamageOutcome } from '../lib/battle/damage';
import { EMPTY_FIELD, NEUTRAL_IVS, type BattlePokemonSpec } from '../lib/battle/types';
import { moveValue } from './bots/greedy';
import { clientBattle, type ClientBattle } from './clientState';
import { linesUpTo, type Replay } from './replay';
import type { SideId } from './types';

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
