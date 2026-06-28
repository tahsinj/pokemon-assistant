/**
 * Convert a persisted team (Team Builder squad) into the HUD's display shape so
 * the home dashboard renders the player's real team instead of demo fixtures.
 * Pure - no IPC, no DOM. A saved build stores no level or live HP, so those
 * fields are left undefined and the HUD hides them.
 */
import type { HudTeamMon, HudType, HudMove } from './hudFixtures';
import type { TeamMemberPersist } from './bridgeTypes';
import type { Pokemon, Move } from './types';

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
    out.push({
      id: `T${m.slot + 1}`,
      name: p.name,
      dex: `#${String(p.dex).padStart(4, '0')}`,
      types: p.types.map((t) => t.toLowerCase() as HudType),
      role: deriveRole(p),
      sprite: p.dex,
      status: null,
      ability: m.ability || p.abilities[0] || '',
      item: m.item || '',
      nature: m.nature || 'Hardy',
      stats: { ...p.baseStats },
      moves: hudMoves,
    });
  }
  return out;
}
