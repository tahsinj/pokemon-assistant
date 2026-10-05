/**
 * Why a hint: the damage it does, what the foe's likeliest set does back,
 * who moves first, and the set the numbers assume. Everything comes from the
 * player's view of the battle and the predictor, never from the bot's real
 * sets.
 */
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import { Dex } from '@pkmn/sim';
import { calcDamage, type DamageOutcome } from '../lib/battle/damage';
import { calcStat } from '../lib/stats';
import type { BattlePokemonSpec } from '../lib/battle/types';
import {
  assumeOpponentSet,
  buildThreatAnalysis,
  formatSpeedComparison,
} from '../lib/battle/search/explain';
import { moveValue } from './bots/greedy';
import { clientField, clientSpec, setSpec } from './clientSpec';
import { setViews, type SetTracking } from './setTracker';
import type { BattleRequest, SideId } from './types';

export interface HintExplanation {
  /** "Earthquake → Gholdengo: 45–53% (2HKO)" when the hint is a move. */
  outgoing: string | null;
  /** The foe's strongest move from its likeliest set, into whoever is in after the hint. */
  incoming: string | null;
  /** "Outspeeds Gholdengo (290 vs 280)." */
  speed: string | null;
  /** How the exchange plays out, in a sentence. */
  exchange: string;
  assumptions: string[];
}

const koes = (d: DamageOutcome | null) => !!d && !d.error && !d.isZero && d.ko.n === 1 && d.ko.chance >= 0.5;

function speedOf(spec: BattlePokemonSpec): number {
  const base = Dex.species.get(spec.speciesName).baseStats.spe;
  let spe = calcStat('spe', base, spec.ivs.spe, spec.evs.spe, spec.level, spec.nature);
  const stage = spec.boosts?.spe ?? 0;
  spe = Math.floor(spe * (stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)));
  if (spec.item && spec.item.replace(/\W/g, '').toLowerCase() === 'choicescarf') spe = Math.floor(spe * 1.5);
  if (spec.status === 'par') spe = Math.floor(spe / 2);
  return spe;
}

function strongest(attacker: BattlePokemonSpec, defender: BattlePokemonSpec, field: ReturnType<typeof clientField>): DamageOutcome | null {
  let best: DamageOutcome | null = null;
  for (const m of attacker.moves) {
    const d = calcDamage(9, attacker, defender, m.name, field);
    if (!best || moveValue(d, defender.currentHPPercent ?? 100) > moveValue(best, defender.currentHPPercent ?? 100)) best = d;
  }
  return best && !best.error && !best.isZero ? best : null;
}

/** Your active, or the bench Pokémon in request slot `slot` (1-based) when the hint is a switch. */
function ownSpec(view: SetTracking, side: SideId, req: BattleRequest, slot: number): BattlePokemonSpec | null {
  const own = view.battle[side];
  if (!slot) return own.active[0] ? clientSpec(own.active[0]) : null;
  const mon = req.side.pokemon[slot - 1];
  if (!mon) return null;
  const seen = own.team.find((p: ClientPokemon) => p.originalIdent === mon.ident);
  if (seen) return clientSpec(seen);
  // A random battle has no team preview, so the client only knows your bench from your sets.
  const name = mon.ident.replace(/^p\d: /, '');
  const set = own.sets?.find((s) => (s.name || s.species) === name);
  const [hp, max] = mon.condition.split(/[/ ]/).map(Number);
  return set ? setSpec(set, max ? (100 * hp) / max : 100) : null;
}

export function explainHint(view: SetTracking, side: SideId, req: BattleRequest, choice: string): HintExplanation | null {
  const foe: SideId = side === 'p1' ? 'p2' : 'p1';
  const battle = view.battle;
  const them = battle[foe].active[0];
  if (!them) return null;
  const model = view.models.get(them.originalIdent);
  const views = model ? setViews(model) : [];
  const guess = views[0]?.set ?? undefined;
  const themSpec = clientSpec(them, guess);

  const [kind, n, tera] = choice.split(' ');
  const usSpec = ownSpec(view, side, req, kind === 'switch' ? Number(n) : 0);
  if (!usSpec) return null;
  const usName = usSpec.speciesName;
  if (tera && usSpec.teraType) usSpec.isTerastallized = true;

  const moveName = kind === 'move' ? req.active?.[0]?.moves[Number(n) - 1]?.move : undefined;
  const out = moveName ? calcDamage(9, usSpec, themSpec, moveName, clientField(battle, side)) : null;
  const incoming = strongest(themSpec, usSpec, clientField(battle, foe));

  const usSpe = speedOf(usSpec);
  const themSpe = speedOf(themSpec);
  const trickRoom = !!battle.field.pseudoWeather.trickroom;
  const priority = (name?: string) => (name ? Dex.moves.get(name).priority : 0);
  const pUs = priority(moveName);
  const pThem = priority(incoming?.moveName);
  const playerFirst = kind === 'switch' || pUs > pThem || (pUs === pThem && (trickRoom ? usSpe <= themSpe : usSpe >= themSpe));
  const threat = buildThreatAnalysis({
    outgoing: moveName && out && !out.error ? { moveName, defenderName: them.speciesForme, outcome: out } : null,
    incoming: incoming ? { attackerName: them.speciesForme, moveName: incoming.moveName, defenderName: usName, outcome: incoming } : null,
    playerFirst,
    playerKO: koes(out),
    opponentKO: koes(incoming),
  });

  const assumptions = views.length
    ? assumeOpponentSet(views).map((a) => a.text)
    : [`No usage data for ${them.speciesForme}: assumes an even spread and its revealed moves only.`];
  return {
    outgoing: threat.outgoing,
    incoming: threat.incoming,
    speed:
      kind === 'switch'
        ? null
        : formatSpeedComparison({ usName, themName: them.speciesForme, usSpe, themSpe, trickRoom }),
    exchange: kind === 'switch' ? `${usName} comes in and takes the hit.` : threat.netExchange,
    assumptions,
  };
}
