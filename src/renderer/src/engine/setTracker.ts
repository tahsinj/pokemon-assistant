/**
 * The set predictor on @pkmn/client state. Walks a battle's protocol lines as
 * one player saw them and keeps a model of each foe Pokémon's set: seeded on
 * first sight, narrowed by every move, ability, item and Tera type it
 * reveals, and reweighted by the damage its attacks deal to your side.
 *
 * Damage is only used when your own sets are known (practice battles):
 * without your spreads the calc can't tell a strong attacker from a frail
 * defender. Hits the calc can't reproduce (crits, multi-hit, moves whose
 * power depends on turn order or history, hidden boosts) are skipped.
 */
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import type { PokemonSet } from '@pkmn/data';
import { Dex } from '@pkmn/sim';
import { calcDamage, type DamageOutcome } from '../lib/battle/damage';
import {
  initOpponentModel,
  narrowByAbility,
  narrowByDamage,
  narrowByItem,
  narrowByMove,
  narrowByTera,
  topCandidates,
  type ObservedDamage,
} from '../lib/battle/predictor/predictor';
import type { OpponentModel, PredictorContext } from '../lib/battle/predictor/types';
import type { SetView } from '../lib/battle/search/explain';
import { clientField, clientSpec, itemId } from './clientSpec';
import { newClientBattle, type ClientBattle } from './clientState';
import type { SideId } from './types';

export interface SetTracking {
  battle: ClientBattle;
  /**
   * One model per foe Pokémon, keyed by its original ident ("p2: Garchomp"),
   * or "preview:<species>" for one only seen at team preview.
   */
  models: Map<string, OpponentModel>;
}

interface Seen {
  model: OpponentModel;
  moves: Set<string>;
  ability: boolean;
  item: boolean;
  tera: boolean;
}

/** A direct hit on your side, with the calc already run for each live candidate. */
interface Hit {
  outcomes: Map<string, DamageOutcome | null>;
  before: number;
  /** HP right after the hit, before any berry or ability heals it. */
  after: number;
  maxhp: number;
  exactHp: boolean;
  target: ClientPokemon;
}

interface PendingMove {
  attacker: string;
  move: string;
  hits: Hit[];
  unclear: boolean;
  hungOn: boolean;
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Lines that start a new action, closing the move before them. */
const ACTION_STARTS = new Set(['move', 'switch', 'drag', 'replace', 'turn', 'upkeep', 'win', 'tie', 'cant', '']);

/** Power depends on turn order, the battle's history or hidden state the calc isn't told. */
const UNREADABLE_MOVES = new Set([
  'assurance', 'avalanche', 'beatup', 'boltbeak', 'counter', 'endeavor', 'finalgambit', 'fishiousrend',
  'fling', 'lashout', 'lastrespects', 'magnitude', 'metalburst', 'mirrorcoat', 'naturalgift', 'payback',
  'present', 'psywave', 'pursuit', 'ragefist', 'retaliate', 'revenge', 'spitup', 'stompingtantrum',
  'temperflare', 'comeuppance', 'ficklebeam',
  // Power from the user's HP, which you only see rounded to a percent.
  'eruption', 'waterspout', 'dragonenergy', 'reversal', 'flail',
]);

/** Moves that raise Special Attack on the charge turn. */
const CHARGE_BOOSTS = new Set(['meteorbeam', 'electroshot']);

const PINCH_ABILITIES = new Set(['blaze', 'torrent', 'overgrow', 'swarm']);

/** Calyrex's As One announces its parts before (or instead of) itself. */
const AS_ONE_PARTS = new Set(['chillingneigh', 'grimneigh', 'unnerve']);

/** Moves that break screens before they hit. */
const SCREEN_BREAKERS = new Set(['brickbreak', 'psychicfangs', 'ragingbull']);

/** Volatiles that change damage in ways the calc inputs don't carry. */
const HIDDEN_BOOST = /^(flashfire|charge|protosynthesis|quarkdrive|stockpile|powertrick|transform|typechange|typeadd|helpinghand|laserfocus|glaiverush)/;

/** Items it got from somewhere else, so they say nothing about its set. */
const NOT_ITS_OWN = new Set(['tricked', 'stolen', 'bestowed']);
const ITEM_LOST = new Set(['eaten', 'flung', 'knocked off', 'stolen', 'consumed', 'incinerated', 'popped']);

/** Base species ("Dudunsparce" for "Dudunsparce-Three-Segment" and for team preview's "Dudunsparce-*"). */
function baseName(p: ClientPokemon): string {
  const name = p.speciesForme.replace(/-\*$/, '');
  return Dex.species.get(name).baseSpecies || name;
}

/** Model key: the ident once it has been in battle, the species while only seen at team preview. */
const keyOf = (p: ClientPokemon) => p.originalIdent || `preview:${baseName(p)}`;

/** The ability it was seen to have, in the form sets name it. */
function revealedAbility(p: ClientPokemon): string | null {
  if (!p.baseAbility) return null;
  if (baseName(p) !== 'Calyrex') return p.baseAbility;
  // As One shows up as "As One", then its parts (Unnerve, Chilling Neigh); sets say "As One (Glastrier)".
  if (AS_ONE_PARTS.has(p.baseAbility)) return null;
  if (p.baseAbility === 'asone') return p.speciesForme.includes('Ice') ? 'As One (Glastrier)' : 'As One (Spectrier)';
  return p.baseAbility;
}

const sideOf = (ident: string): SideId | null => (ident.startsWith('p1') ? 'p1' : ident.startsWith('p2') ? 'p2' : null);

export function trackSets(
  lines: readonly string[],
  side: SideId,
  ctx: PredictorContext,
  ownSets?: PokemonSet[],
): SetTracking {
  const foe: SideId = side === 'p1' ? 'p2' : 'p1';
  const battle = newClientBattle({ player: side, sets: ownSets });
  const seen = new Map<string, Seen>();
  let pending: PendingMove | null = null;
  /** Your Pokémon that switched in this turn. */
  const switchedIn = new Set<string>();
  /** Each foe's record as it stood when it last switched in, to undo an Illusion's reveals. */
  const atSwitchIn = new Map<string, Seen>();

  const close = () => {
    const p = pending;
    pending = null;
    if (!p || p.unclear || p.hits.length !== 1) return;
    const s = seen.get(p.attacker);
    if (!s) return;
    const hit = p.hits[0];
    const dealt = hit.before - hit.after;
    if (dealt <= 0) return;
    const atLeast = hit.after <= 0 || p.hungOn;
    const observed: ObservedDamage = hit.exactHp
      ? { amount: dealt, unit: 'hp', atLeast }
      : { amount: (100 * dealt) / hit.maxhp, unit: 'pct', tolerance: 1.5, atLeast };
    s.model = narrowByDamage(s.model, p.move, observed, (c) => hit.outcomes.get(c.id) ?? null, hit.target.speciesForme);
  };

  /** Run the calc for every live candidate of the foe's active against `target`, as things stand now. */
  const recordHit = (target: ClientPokemon): Hit | null => {
    if (!pending) return null;
    const attacker = battle[foe].active[0];
    const s = attacker && seen.get(keyOf(attacker));
    const illusion = [...battle.p1.team, ...battle.p2.team].some((p) => /^zor(ua|oark)/.test(toId(baseName(p))));
    const hidden = (p: ClientPokemon) =>
      Object.keys(p.volatiles).some((v) => HIDDEN_BOOST.test(v.replace(/^(ability|item|move):\s*/, '')));
    if (!attacker || !s || !target.set || illusion || hidden(attacker) || hidden(target)) {
      pending.unclear = true;
      return null;
    }
    const alliesDown = battle[foe].team.filter((p) => p.fainted).length;
    const attackerPct = (100 * attacker.hp) / (attacker.maxhp || 1);
    const defender = clientSpec(target);
    const field = clientField(battle, foe);
    if (SCREEN_BREAKERS.has(toId(pending.move))) {
      field.defenderSide = { ...field.defenderSide, isReflect: false, isLightScreen: false, isAuroraVeil: false };
    }
    // Abilities whose boost depends on things the calc isn't told.
    const unreadable = (ability: string) =>
      ability === 'analytic' ||
      ability === 'slowstart' ||
      // Blaze and the like kick in at 1/3 HP, and the foe's HP is only known to the percent.
      (PINCH_ABILITIES.has(ability) && attackerPct > 25 && attackerPct < 40) ||
      (ability === 'supremeoverlord' && alliesDown > 0) ||
      (ability === 'stakeout' && switchedIn.has(target.originalIdent));
    // The calc adds the charge turn's boost itself; the client already shows it.
    const charged = CHARGE_BOOSTS.has(toId(pending.move));
    const outcomes = new Map<string, DamageOutcome | null>();
    for (const c of s.model.candidates) {
      if (c.eliminated) continue;
      const ability = toId(attacker.ability || c.ability);
      const spec = clientSpec(attacker, c);
      if (charged) spec.boosts = { ...spec.boosts, spa: Math.max(-6, (spec.boosts?.spa ?? 0) - 1) };
      outcomes.set(c.id, unreadable(ability) ? null : calcDamage(9, spec, defender, pending.move, field));
    }
    // Your own side shows exact HP to you; a spectator log shows percentages.
    const hit = { outcomes, before: target.hp, after: target.hp, maxhp: target.maxhp, exactHp: target.maxhp !== 100, target };
    pending.hits.push(hit);
    return hit;
  };

  /** Cosmetic formes (Maushold-Four) aren't in the dex; their base species is. */
  const dexName = (p: ClientPokemon) =>
    ctx.pokemonByName[p.speciesForme.toLowerCase()] ? p.speciesForme : baseName(p);

  /**
   * An Illusion just broke: everything the foe "showed" since the disguised
   * Pokémon switched in came from the Illusion user. Put the disguise's record
   * back and ignore what the client still lists for it.
   */
  const undoIllusion = () => {
    const shown = battle[foe].active[0];
    const before = shown && atSwitchIn.get(keyOf(shown));
    if (!shown || !before) return;
    seen.set(keyOf(shown), {
      model: before.model,
      moves: new Set([...before.moves, ...shown.moveSlots.map((m) => m.id as string)]),
      ability: before.ability || !!shown.baseAbility,
      item: before.item || !!shown.item || !!shown.lastItem,
      tera: before.tera || !!shown.terastallized,
    });
  };

  const observeReveals = () => {
    const team = battle[foe].team;
    for (const p of team) {
      // The client can keep the preview entry for a moment after the switch-in.
      if (!p.originalIdent && team.some((q) => q.originalIdent && baseName(q) === baseName(p))) continue;
      const key = keyOf(p);
      let s = seen.get(key);
      // A Pokémon shown at team preview gets its ident when it first switches in.
      const previewKey = `preview:${baseName(p)}`;
      if (!s && p.originalIdent && seen.has(previewKey)) {
        s = seen.get(previewKey)!;
        seen.delete(previewKey);
        seen.set(key, s);
        // Preview hides some formes ("Dudunsparce-*"); seed again now the forme is known.
        if (!s.model.candidates.length) s.model = initOpponentModel(dexName(p), p.level, ctx);
      }
      if (!s) {
        s = {
          model: initOpponentModel(dexName(p), p.level, ctx),
          moves: new Set(),
          ability: false,
          item: false,
          tera: false,
        };
        seen.set(key, s);
      }
      for (const slot of p.moveSlots) {
        if (slot.virtual || slot.id === 'struggle' || s.moves.has(slot.id)) continue;
        s.moves.add(slot.id);
        s.model = narrowByMove(s.model, slot.name);
      }
      const ability = revealedAbility(p);
      if (!s.ability && ability) {
        s.ability = true;
        s.model = narrowByAbility(s.model, ability);
      }
      if (!s.item) {
        if (NOT_ITS_OWN.has(p.itemEffect)) {
          s.item = true;
        } else if (p.item) {
          s.item = true;
          s.model = narrowByItem(s.model, itemId(p.item));
        } else if (p.lastItem && ITEM_LOST.has(p.lastItemEffect)) {
          s.item = true;
          s.model = narrowByItem(s.model, itemId(p.lastItem));
        }
      }
      if (!s.tera && p.terastallized) {
        s.tera = true;
        s.model = narrowByTera(s.model, p.terastallized);
      }
    }
  };

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const parts = line.split('|');
    const kind = parts[1];
    const hasFrom = parts.some((x) => x.startsWith('[from]'));
    let hit: Hit | null = null;

    if (ACTION_STARTS.has(kind) || kind === 'faint') close();
    if (kind === 'turn') switchedIn.clear();
    if (kind === 'replace' && sideOf(parts[2]) === foe) undoIllusion();
    if (kind === 'move' && sideOf(parts[2]) === foe && !hasFrom) {
      const attacker = battle[foe].active[0];
      pending = attacker
        ? { attacker: keyOf(attacker), move: parts[3], hits: [], unclear: UNREADABLE_MOVES.has(toId(parts[3])), hungOn: false }
        : null;
    } else if (pending && sideOf(parts[2] ?? '') === side) {
      if (kind === '-crit' || kind === '-hitcount') pending.unclear = true;
      if (kind === '-enditem' && toId(parts[3] ?? '') === 'focussash') pending.hungOn = true;
      if ((kind === '-activate' || kind === '-ability') && /sturdy|endure/i.test(parts[3] ?? '')) pending.hungOn = true;
      if (kind === '-activate' && /disguise|ice face/i.test(parts[3] ?? '')) pending.unclear = true;
      if (kind === '-damage' && !hasFrom) {
        const target = battle[side].active[0];
        if (target) hit = recordHit(target);
      }
    }

    battle.add(line);
    if (hit) hit.after = hit.target.hp;
    observeReveals();
    if (kind === 'switch' || kind === 'drag') {
      const who = sideOf(parts[2]);
      const active = who && battle[who].active[0];
      if (active && who === side) switchedIn.add(active.originalIdent);
      const record = active && who === foe && seen.get(keyOf(active));
      if (record) atSwitchIn.set(keyOf(active), { ...record, moves: new Set(record.moves) });
    }
  }
  close();

  const models = new Map<string, OpponentModel>();
  for (const [ident, s] of seen) models.set(ident, s.model);
  return { battle, models };
}

/** The model's likeliest sets in the shape the explanation helpers take. */
export function setViews(model: OpponentModel, k = 3): SetView[] {
  return topCandidates(model, k).map((set) => ({ set, weight: set.weight }));
}
