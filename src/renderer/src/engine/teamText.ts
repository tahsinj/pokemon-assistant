/** Stored teams (saved teams, the Team Builder draft) as Showdown export text for the simulator. */
import type { TeamMemberPersist } from '../lib/bridgeTypes';
import { abilityName, moveName } from '../lib/displayNames';
import { exportShowdownFromParsed } from '../lib/showdownTeam';
import type { Move } from '../lib/types';

export function membersToShowdown(members: TeamMemberPersist[], moves: Record<string, Move>): string {
  return exportShowdownFromParsed(
    [...members]
      .filter((m) => m.speciesDisplay)
      .sort((a, b) => a.slot - b.slot)
      .map((m) => ({
        species: m.speciesDisplay,
        item: m.item ?? undefined,
        ability: m.ability ? abilityName(m.ability) : undefined,
        nature: m.nature ?? undefined,
        level: m.level ?? undefined,
        evs: m.evs ?? {},
        ivs: m.ivs ?? {},
        moves: (m.moves ?? []).filter(Boolean).map((x) => moveName(x, moves)),
        rawSpeciesLine: m.speciesDisplay,
      })),
  );
}
