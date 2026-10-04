/**
 * Level 1: pick the move with the most expected damage this turn, and switch
 * out when the foe is faster and one of its revealed moves is a sure KO.
 */
import type { Pokemon as SimPokemon } from '@pkmn/sim';
import { calcDamage, type DamageOutcome } from '../../lib/battle/damage';
import type { Engine } from '../engine';
import type { BattleRequest, SideId } from '../types';
import { foeOf, type Bot } from './bot';
import { legalChoices, switchTargets } from './random';
import { fieldFor, foeSpec, ownSpec } from './view';

/** Expected share of the target's current HP a move takes, with a bonus for a KO. */
export function moveValue(d: DamageOutcome, targetHpPercent: number): number {
  if (d.error || d.isZero) return d.category === 'Status' ? 1 : 0;
  const expected = Math.min(targetHpPercent, (d.pctMin + d.pctMax) / 2);
  const koNow = d.ko.n === 1 ? d.ko.chance : 0;
  return expected + 50 * koNow;
}

function bestHit(engine: Engine, side: SideId, attacker: SimPokemon, defender: SimPokemon, own: boolean): DamageOutcome | null {
  const atk = own ? ownSpec(attacker) : foeSpec(attacker);
  const def = own ? foeSpec(defender) : ownSpec(defender);
  const field = fieldFor(engine.battle, side);
  let best: DamageOutcome | null = null;
  for (const m of atk.moves) {
    const d = calcDamage(9, atk, def, m.name, field);
    if (!best || moveValue(d, def.currentHPPercent ?? 100) > moveValue(best, def.currentHPPercent ?? 100)) best = d;
  }
  return best;
}

const sureKo = (d: DamageOutcome | null) => !!d && !d.isZero && !d.error && d.ko.n === 1 && d.ko.chance >= 1;

export const greedyBot: Bot = {
  level: 1,
  name: 'Greedy',
  choose(engine: Engine, side: SideId, req: BattleRequest): string {
    if (req.teamPreview) return 'default';
    const battle = engine.battle;
    const mine = battle[side];
    const foe = battle[foeOf(side)].active[0];
    const bench = switchTargets(req);
    const benchMon = (slot: number) => mine.pokemon[slot - 1];

    // Bring in whatever hits the foe hardest while taking the least back.
    const bestSwitch = (): string | null => {
      if (!bench.length) return null;
      if (!foe) return `switch ${bench[0]}`;
      let best = bench[0];
      let bestScore = -Infinity;
      for (const slot of bench) {
        const mon = benchMon(slot);
        const dealt = bestHit(engine, side, mon, foe, true);
        const taken = bestHit(engine, foeOf(side), foe, mon, false);
        const score = (dealt ? moveValue(dealt, 100 * foe.hp / foe.maxhp) : 0) - (taken ? moveValue(taken, 100) : 0) / 2;
        if (score > bestScore) {
          bestScore = score;
          best = slot;
        }
      }
      return `switch ${best}`;
    };

    if (req.forceSwitch?.[0]) return bestSwitch() ?? 'pass';
    const me = mine.active[0];
    const active = req.active?.[0];
    if (!me || !foe || !active) return legalChoices(req)[0] ?? 'default';

    const def = foeSpec(foe);
    const atk = ownSpec(me);
    const field = fieldFor(battle, side);
    let bestMove = -1;
    let bestValue = -Infinity;
    let bestOutcome: DamageOutcome | null = null;
    active.moves.forEach((m, i) => {
      if (m.disabled || m.pp === 0) return;
      const d = calcDamage(9, atk, def, m.move, field);
      const v = moveValue(d, def.currentHPPercent ?? 100);
      if (v > bestValue) {
        bestValue = v;
        bestMove = i;
        bestOutcome = d;
      }
    });

    const canSwitch = !active.trapped && !active.maybeTrapped && bench.length > 0;
    if (canSwitch && !sureKo(bestOutcome)) {
      const threat = bestHit(engine, foeOf(side), foe, me, false);
      const foeFaster = foe.getStat('spe') >= me.getStat('spe');
      if (sureKo(threat) && foeFaster) return bestSwitch() ?? `move ${bestMove + 1}`;
    }
    return bestMove >= 0 ? `move ${bestMove + 1}` : legalChoices(req)[0] ?? 'default';
  },
};
