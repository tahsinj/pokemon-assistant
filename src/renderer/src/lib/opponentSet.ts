/**
 * Build the *assumed* set for an opponent species at a given level + bulk tier,
 * for the Counter Draft planner. Moves / ability / item come from the Smogon
 * usage-modal set (else the species' best damaging learnset moves). The bulk
 * tier drives IV / EV / nature so the matrix can be re-computed under
 * Min / Max IV / Competitive assumptions. Pure - tested in opponentSet.test.ts.
 */
import type { Pokemon, Move, BaseStats } from './types';
import type { SmogonSpeciesIntel } from './smogon';
import type { CombatImportInput } from './toCombatSpec';

/** Opponent investment assumption. See the 2026-06-14 design spec. */
export type OpponentBulk = 'min' | 'maxIv' | 'competitive';

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
const ZERO_IVS: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
/** Generic invested bulk for off-meta species under the Competitive tier. */
const STANDARD_BULK_EVS: BaseStats = { hp: 252, atk: 0, def: 128, spa: 0, spd: 128, spe: 0 };
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
  bulk: OpponentBulk = 'maxIv',
): AssumedSet {
  // moves / ability / item - best guess, independent of bulk tier.
  let setMoves: string[];
  let ability: string | null;
  let item: string | null;
  if (intel) {
    setMoves = intel.moves.slice(0, 4).map((m) => m.name);
    if (setMoves.length === 0) setMoves = bestDamagingMoves(species, moves);
    ability = intel.abilities[0]?.name ?? species.abilities[0] ?? null;
    const topItem = intel.items.find((i) => i.name && i.name !== 'No item');
    item = topItem?.name ?? null;
  } else {
    setMoves = bestDamagingMoves(species, moves);
    ability = species.abilities[0] ?? null;
    item = null;
  }

  // IV / EV / nature - driven by the bulk tier.
  let ivs: CombatImportInput['ivs'];
  let evs: BaseStats;
  let nature: string;
  if (bulk === 'min') {
    ivs = { ...ZERO_IVS };
    evs = { ...ZERO_EVS };
    nature = 'Hardy';
  } else if (bulk === 'competitive') {
    ivs = null; // 31s downstream
    const spread = intel?.spreads?.[0];
    if (spread) {
      evs = spreadToEvs(spread.evs);
      nature = spread.nature ?? 'Hardy';
    } else {
      evs = { ...STANDARD_BULK_EVS };
      nature = 'Hardy';
    }
  } else {
    // maxIv (default)
    ivs = null; // 31s downstream
    evs = { ...ZERO_EVS };
    nature = 'Hardy';
  }

  const input: CombatImportInput = {
    speciesId: species.id,
    speciesDisplay: species.name,
    level,
    nature,
    ability,
    item,
    ivs,
    evs,
    moves: setMoves.length ? setMoves : null,
  };

  return { moves: setMoves, ability, item, nature, evs, input };
}
