/**
 * Search without peeking. A bot, or the hint for the player, must not plan
 * with the foe's real sets, so each search runs on a copy of the battle in
 * which every foe Pokémon's unrevealed parts (moves, item, ability, spread,
 * Tera type) are replaced by a set drawn from the predictor's model of it.
 * What the battle has revealed stays as it is.
 *
 * A Pokémon the predictor has no candidates for keeps its real set apart
 * from its moves, which shrink to the ones it has used.
 */
import type { Battle, Pokemon as SimPokemon } from '@pkmn/sim';
import { Dex, toID } from '@pkmn/sim';
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import type { PredictedSet } from '../../lib/battle/predictor/types';
import type { Engine } from '../engine';
import type { SetTracking } from '../setTracker';
import type { SideId } from '../types';

type MoveSlot = SimPokemon['baseMoveSlots'][number];
/** The simulator marks these readonly because battles never change them; a search copy may. */
type Writable = { -readonly [K in keyof SimPokemon]: SimPokemon[K] };

/** The tracker's view of a simulator Pokémon: by ident once it has battled, else by species from team preview. */
function seenAs(tracking: SetTracking, foe: SideId, p: SimPokemon): { client?: ClientPokemon; key: string } {
  const client = tracking.battle[foe].team.find((c) => c.originalIdent === p.fullname);
  if (client) return { client, key: p.fullname };
  return { key: `preview:${Dex.species.get(p.species.name).baseSpecies}` };
}

function pick(sets: PredictedSet[], rand: () => number): PredictedSet | null {
  const live = sets.filter((s) => !s.eliminated);
  const total = live.reduce((t, s) => t + s.weight, 0);
  let r = rand() * total;
  for (const s of live) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return live[live.length - 1] ?? null;
}

/** Revealed moves first, then the set's other moves in random order, four at most. */
function chooseMoves(revealed: string[], set: PredictedSet | null, rand: () => number): string[] {
  const out = [...revealed];
  const rest = (set?.moves ?? []).map(toID).filter((m) => m && !out.includes(m) && Dex.moves.get(m).exists);
  while (out.length < 4 && rest.length) out.push(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  return out;
}

function moveSlots(battle: Battle, p: Writable, ids: string[]): MoveSlot[] {
  return ids.map((id) => {
    const kept = p.baseMoveSlots.find((s) => s.id === id);
    if (kept) return kept;
    const move = Dex.moves.get(id);
    const pp = battle.calculatePP(move, 3);
    return { move: move.name, id: move.id, pp, maxpp: pp, target: move.target, disabled: false, disabledSource: '', used: false };
  });
}

function applySet(battle: Battle, p: Writable, client: ClientPokemon | undefined, set: PredictedSet | null, rand: () => number): void {
  const revealed = (client?.moveSlots ?? []).filter((m) => !m.virtual).map((m) => m.id as string);
  const moves = set ? chooseMoves(revealed, set, rand) : revealed;
  if (moves.length) {
    p.baseMoveSlots = moveSlots(battle, p, moves);
    p.moveSlots = p.baseMoveSlots.slice();
    p.set.moves = moves;
  }
  if (!set) return;

  const fraction = p.maxhp ? p.hp / p.maxhp : 1;
  // Edit the set in place: serialization finds each Pokémon's team slot by its set object.
  Object.assign(p.set, { nature: set.nature, evs: { ...set.evs }, ivs: { ...set.ivs } });
  const stats = battle.spreadModify(p.species.baseStats, p.set);
  if (p.species.maxHP) stats.hp = p.species.maxHP;
  p.baseStoredStats = stats;
  for (const stat of ['atk', 'def', 'spa', 'spd', 'spe'] as const) p.storedStats[stat] = stats[stat];
  if (!p.volatiles.dynamax) {
    p.baseMaxhp = stats.hp;
    p.maxhp = stats.hp;
  }
  if (p.hp > 0) p.hp = Math.max(1, Math.round(fraction * p.maxhp));

  const itemKnown = !!client && (!!client.item || !!client.lastItem);
  if (!itemKnown) {
    p.item = toID(set.item ?? '');
    p.itemState = battle.initEffectState({ id: p.item, target: p });
  }
  if (!client?.baseAbility && set.ability) {
    p.baseAbility = p.ability = toID(set.ability);
    p.abilityState = battle.initEffectState({ id: p.ability, target: p });
  }
  if (!p.terastallized && set.teraType) p.teraType = set.teraType;
}

/**
 * Overwrite the foe's hidden information in `engine` (a copy) with sets
 * drawn from `tracking`, the side's view of the battle.
 */
export function determinize(engine: Engine, tracking: SetTracking, foe: SideId, rand: () => number): void {
  for (const p of engine.battle[foe].pokemon) {
    if (p.transformed || p.illusion) continue;
    const { client, key } = seenAs(tracking, foe, p);
    const model = tracking.models.get(key);
    if (!model) continue;
    applySet(engine.battle, p, client, pick(model.candidates, rand), rand);
  }
}
