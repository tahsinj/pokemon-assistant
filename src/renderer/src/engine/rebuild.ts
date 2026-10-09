/**
 * A simulator battle rebuilt from a replay at the start of a turn, so the
 * search bot can judge a decision someone made outside the app. Teams are
 * what the replay revealed, filled in with each Pokémon's likeliest set from
 * the predictor; HP, status, boosts, Tera, hazards, weather and terrain are
 * copied from the replay. Volatile effects (Substitute, confusion, choice
 * locks) and PP are not.
 */
import type { Pokemon as ClientPokemon } from '@pkmn/client';
import { Dex, Teams, toID, type PokemonSet } from '@pkmn/sim';
import type { PredictedSet, PredictorContext } from '../lib/battle/predictor/types';
import { itemId } from './clientSpec';
import { clientBattle, type ClientBattle } from './clientState';
import { Engine, seedFrom } from './engine';
import { linesUpTo, type Replay } from './replay';
import { trackSets, type SetTracking } from './setTracker';
import type { SideId } from './types';

export interface Rebuilt {
  engine: Engine;
  /** The reviewed side's view of the battle, for the search. */
  view: SetTracking;
}

const WEATHER: Record<string, string> = {
  Rain: 'raindance',
  Sun: 'sunnyday',
  Sand: 'sandstorm',
  Snow: 'snowscape',
  Hail: 'hail',
  'Harsh Sunshine': 'desolateland',
  'Heavy Rain': 'primordialsea',
  'Strong Winds': 'deltastream',
};

/** The simulator format for a replay's tier line ("[Gen 9] OU", "[Gen 9] National Dex"). */
export function formatFor(tier: string): string {
  return /national dex/i.test(tier) ? 'gen9nationaldex' : 'gen9ou';
}

const baseOf = (p: ClientPokemon) => Dex.species.get(p.speciesForme.replace(/-\*$/, '')).baseSpecies;

/** Each Pokémon of a side once: switched-in ones, then team preview entries that never came in. Active first. */
function roster(battle: ClientBattle, side: SideId): ClientPokemon[] {
  const team = battle[side].team;
  const seen = team.filter((p) => p.originalIdent);
  const preview = team.filter((p) => !p.originalIdent && !seen.some((q) => baseOf(q) === baseOf(p)));
  const all = [...seen, ...preview];
  const active = battle[side].active[0];
  return active ? [active, ...all.filter((p) => p !== active)] : all;
}

function top(sets: PredictedSet[] | undefined): PredictedSet | null {
  const live = (sets ?? []).filter((s) => !s.eliminated);
  return live.reduce<PredictedSet | null>((a, b) => (!a || b.weight > a.weight ? b : a), null);
}

/** A full set for a Pokémon seen in the replay: what it revealed, the rest from its likeliest candidate. */
function setFor(p: ClientPokemon, guess: PredictedSet | null): PokemonSet {
  const moves = p.moveSlots.filter((m) => !m.virtual).map((m) => m.name as string);
  for (const m of guess?.moves ?? []) {
    if (moves.length >= 4) break;
    if (!moves.some((x) => toID(x) === toID(m))) moves.push(m);
  }
  const species = p.speciesForme.replace(/-\*$/, '');
  const item = p.item ? itemId(p.item) : p.lastItem ? itemId(p.lastItem) : (guess?.item ?? '');
  return {
    name: p.originalIdent ? p.originalIdent.replace(/^p\d: /, '') : p.name,
    species,
    item,
    ability: p.baseAbility || guess?.ability || Dex.species.get(species).abilities[0],
    moves: moves.length ? moves : ['Tackle'],
    nature: guess?.nature ?? 'Hardy',
    gender: p.gender || '',
    evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84, ...guess?.evs },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31, ...guess?.ivs },
    level: p.level,
    teraType: p.terastallized ?? guess?.teraType ?? undefined,
  };
}

/** Copy one Pokémon's public state from the replay onto its simulator twin. */
function patchPokemon(engine: Engine, side: SideId, i: number, c: ClientPokemon): void {
  const battle = engine.battle;
  const p = battle[side].pokemon[i];
  // Seen only at team preview: nothing to copy, it is at full health.
  if (!p || !c.maxhp) return;
  if (c.fainted || c.hp <= 0) {
    if (!p.fainted) {
      p.hp = 0;
      p.fainted = true;
      p.status = 'fnt' as never;
      battle[side].pokemonLeft--;
    }
    return;
  }
  p.hp = Math.max(1, Math.round((c.hp / (c.maxhp || 100)) * p.maxhp));
  p.status = (c.status ?? '') as never;
  p.statusState = battle.initEffectState({ id: c.status ?? '', target: p });
  p.boosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0, ...c.boosts };
  if (c.terastallized) {
    p.terastallized = c.terastallized;
    p.teraType = c.terastallized;
    for (const q of battle[side].pokemon) q.canTerastallize = null;
  }
  if (!c.item && c.lastItem) p.item = '';
}

function patchField(engine: Engine, client: ClientBattle): void {
  const battle = engine.battle;
  const field = battle.field;
  // The simulator wants a Pokémon behind every field effect; either active will do.
  const source = battle.p1.active[0] ?? battle.p2.active[0];
  field.clearWeather();
  field.clearTerrain();
  const weather = client.field.weather && WEATHER[client.field.weather];
  if (weather) field.setWeather(weather, source);
  if (client.field.terrain) field.setTerrain(`${toID(client.field.terrain)}terrain`, source);
  for (const id of Object.keys(client.field.pseudoWeather)) field.addPseudoWeather(id, source);
  for (const side of ['p1', 'p2'] as const) {
    const setter = battle[side === 'p1' ? 'p2' : 'p1'].active[0] ?? source;
    for (const [id, c] of Object.entries(client[side].sideConditions)) {
      for (let n = 0; n < Math.max(1, c.level); n++) battle[side].addSideCondition(id, setter);
    }
  }
}

/**
 * The battle at the start of `turn` from `side`'s seat, or null when the
 * replay doesn't show enough (no actives yet).
 */
export function rebuildAt(replay: Replay, turn: number, side: SideId, ctx: PredictorContext): Rebuilt | null {
  const lines = linesUpTo(replay, turn);
  const client = clientBattle(lines);
  if (!client.p1.active[0] || !client.p2.active[0]) return null;
  // Each side's sets as the other side would guess them.
  const guessed = { p1: trackSets(lines, 'p2', ctx), p2: trackSets(lines, 'p1', ctx) };
  const rosters = { p1: roster(client, 'p1'), p2: roster(client, 'p2') };
  const team = (s: SideId) =>
    rosters[s].map((p) => setFor(p, top(guessed[s].models.get(p.originalIdent || `preview:${baseOf(p)}`)?.candidates)));
  const engine = Engine.start({
    format: formatFor(replay.format),
    seed: seedFrom(turn),
    p1: { name: replay.players.p1, team: Teams.pack(team('p1')) },
    p2: { name: replay.players.p2, team: Teams.pack(team('p2')) },
  });
  if (engine.request('p1')?.teamPreview) {
    engine.choose('p1', 'team 1');
    engine.choose('p2', 'team 1');
  }
  for (const s of ['p1', 'p2'] as const) rosters[s].forEach((c, i) => patchPokemon(engine, s, i, c));
  patchField(engine, client);
  return { engine, view: trackSets(lines, side, ctx) };
}
