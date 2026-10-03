/**
 * Convert a persisted team (Team Builder squad) into the HUD's display shape so
 * the home dashboard renders the player's real team instead of demo fixtures.
 * Pure - no IPC, no DOM. A slot's level is only known when it came from a PC
 * mon (a Showdown-style build carries none); live HP is never stored. Unknown
 * fields are left undefined and the HUD hides them.
 */
import type { HudTeamMon, HudType, HudMove } from './hudFixtures';
import type { TeamMemberPersist } from './bridgeTypes';
import type { Pokemon, Move, BaseStats } from './types';
import { abilityName } from './displayNames';
import { calcAllStats, bst } from './stats';

/** Coerce a (possibly partial / missing) stat record into a full spread. */
function toSpread(src: Record<string, number> | null | undefined, fallback: number): BaseStats {
  const f = (k: string) => (src && typeof src[k] === 'number' ? src[k] : fallback);
  return { hp: f('hp'), atk: f('atk'), def: f('def'), spa: f('spa'), spd: f('spd'), spe: f('spe') };
}

/**
 * Abilities are stored id-form ("roughskin") in our data. Resolve to the proper
 * display name ("Rough Skin") via the Showdown ability table, falling back to a
 * title-cased version of the raw string for anything unrecognised.
 */
function prettyAbility(raw: string | null, p: Pokemon): string {
  if (raw) return abilityName(raw);
  return p.abilities[0] ? abilityName(p.abilities[0]) : '';
}

function catLetter(category: Move['category']): string {
  if (category === 'Physical') return 'P';
  if (category === 'Special') return 'S';
  return '-';
}

/** A light cosmetic role from base stats - purely for the HUD label. */
function deriveRole(p: Pokemon): string {
  const s = p.baseStats;
  const bulk = s.hp + s.def + s.spd;
  const offense = Math.max(s.atk, s.spa);
  if (s.spe >= 100 && offense >= 100) return 'Sweep';
  if (s.spe >= 110) return 'Fast';
  if (bulk >= 300) return 'Wall';
  if (offense >= 110) return 'Breaker';
  return 'Pivot';
}

function resolveMove(name: string, moves: Record<string, Move>): HudMove | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mo = moves[key];
  if (!mo) return null;
  return {
    name: mo.name,
    type: mo.type.toLowerCase() as HudType,
    cat: catLetter(mo.category),
    pow: mo.power ?? 0,
    acc: mo.accuracy === true ? 100 : mo.accuracy,
    pp: mo.pp,
  };
}

export function toHudTeam(
  members: TeamMemberPersist[],
  pokemonById: Record<string, Pokemon>,
  moves: Record<string, Move>,
): HudTeamMon[] {
  const out: HudTeamMon[] = [];
  for (const m of members) {
    if (!m.speciesId) continue;
    const p = pokemonById[m.speciesId];
    if (!p) continue;
    const hudMoves = (m.moves ?? [])
      .filter((mv) => mv && mv.trim())
      .map((mv) => resolveMove(mv, moves))
      .filter((mv): mv is HudMove => !!mv)
      .slice(0, 4);

    // Always show real computed stats. The slot's level is used when known
    // (PC mon or a Showdown build with an explicit "Level:"); otherwise we
    // assume 100, the competitive default. IVs default to 31, EVs to 0.
    const nature = m.nature || 'Hardy';
    const knownLevel = typeof m.level === 'number';
    const statLevel = knownLevel ? (m.level as number) : 100;
    const ivs = toSpread(m.ivs, 31);
    const evs = toSpread(m.evs, 0);
    const stats = calcAllStats(p.baseStats, ivs, evs, statLevel, nature);

    out.push({
      id: `T${m.slot + 1}`,
      name: p.name,
      dex: `#${String(p.dex).padStart(4, '0')}`,
      ...(knownLevel ? { lv: m.level as number } : {}),
      types: p.types.map((t) => t.toLowerCase() as HudType),
      role: deriveRole(p),
      sprite: p.dex,
      status: null,
      ability: prettyAbility(m.ability, p),
      item: m.item || '',
      nature,
      stats,
      ivs,
      evs,
      bst: bst(p.baseStats),
      statLevel,
      levelAssumed: !knownLevel,
      moves: hudMoves,
    });
  }
  return out;
}
