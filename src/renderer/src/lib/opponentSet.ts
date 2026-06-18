/**
 * Build the *assumed* set for an opponent species at a given level, for the
 * Counter Draft planner. Prefers the Smogon usage-modal set (top ability /
 * item / spread, and the curated/most-used moves); falls back to the species'
 * best damaging learnset moves with a neutral nature when no Smogon intel
 * exists. Pure - unit tested in opponentSet.test.ts.
 */
import type { Pokemon, Move, BaseStats } from './types';
import type { SmogonSpeciesIntel } from './smogon';
import type { CombatImportInput } from './toCombatSpec';

export interface AssumedSet {
  moves: string[];
  ability: string | null;
  item: string | null;
  nature: string;
  evs: BaseStats;
  /** Ready to hand to toCombatFields(set.input, species, set.moves). */
  input: CombatImportInput;
}

const ZERO_EVS: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const STAT_ORDER: (keyof BaseStats)[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function spreadToEvs(evs: number[]): BaseStats {
  const out = { ...ZERO_EVS };
  STAT_ORDER.forEach((k, i) => (out[k] = Number(evs[i]) || 0));
  return out;
}

/** Highest-power damaging moves the species can learn, best first, up to 4. */
function bestDamagingMoves(p: Pokemon, moves: Record<string, Move>, limit = 4): string[] {
  return p.moves
    .map((lm) => moves[lm.move])
    .filter((m): m is Move => !!m && (m.power ?? 0) > 0)
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
    .slice(0, limit)
    .map((m) => m.name);
}

export function assumedOpponentSpec(
  species: Pokemon,
  level: number,
  intel: SmogonSpeciesIntel | null,
  moves: Record<string, Move>,
): AssumedSet {
  let setMoves: string[];
  let ability: string | null;
  let item: string | null;
  let nature: string;
  let evs: BaseStats;

  if (intel) {
    setMoves = intel.moves.slice(0, 4).map((m) => m.name);
    if (setMoves.length === 0) setMoves = bestDamagingMoves(species, moves);
    ability = intel.abilities[0]?.name ?? species.abilities[0] ?? null;
    const topItem = intel.items.find((i) => i.name && i.name !== 'No item');
    item = topItem?.name ?? null;
    const spread = intel.spreads[0];
    nature = spread?.nature ?? 'Hardy';
    evs = spread ? spreadToEvs(spread.evs) : { ...ZERO_EVS };
  } else {
    setMoves = bestDamagingMoves(species, moves);
    ability = species.abilities[0] ?? null;
    item = null;
    nature = 'Hardy';
    evs = { ...ZERO_EVS };
  }

  const input: CombatImportInput = {
    speciesId: species.id,
    speciesDisplay: species.name,
    level,
    nature,
    ability,
    item,
    ivs: null,
    evs,
    moves: setMoves.length ? setMoves : null,
  };

  return { moves: setMoves, ability, item, nature, evs, input };
}
