/**
 * Level-aware counter ranking over the user's actual PC box Pokémon.
 *
 * Unlike `topCounters` (species-level, base stats only), this scores each
 * stored mon with its real level / IVs / EVs / nature via `calcAllStats`, and
 * with the moves it actually knows (falling back to the species learnset when
 * the record carries none). Badly underleveled mons are excluded outright -
 * a level 1 Charizard is not an answer to a level 50 anything.
 */

import type { Move, Pokemon } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import { effectiveness } from './typechart';
import { learnableMoves } from './recommender';
import { calcAllStats } from './stats';

export interface PcCounterOptions {
  /** Assumed level of the threat being countered. */
  targetLevel: number;
  /** Candidates below `targetLevel x minLevelRatio` are excluded (default 0.6). */
  minLevelRatio?: number;
  limit?: number;
}

export interface PcCounterResult {
  rec: PcPokemonRecord;
  p: Pokemon;
  score: number;
}

const NEUTRAL_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const toMoveId = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The record's known moves resolved against the move dex; learnset fallback. */
function usableMoves(rec: PcPokemonRecord, p: Pokemon, moves: Record<string, Move>): Move[] {
  const own = rec.moves
    .map((name) => moves[toMoveId(name)])
    .filter((m): m is Move => !!m);
  if (own.length > 0) return own;
  return learnableMoves(p, moves);
}

function pcCounterScore(
  rec: PcPokemonRecord,
  p: Pokemon,
  target: Pokemon,
  targetLevel: number,
  moves: Record<string, Move>,
): number {
  const cand = calcAllStats(p.baseStats, rec.ivs, rec.evs, rec.level, rec.nature);
  // Threat baseline: neutral nature, full IVs, no EVs at the assumed level.
  const threat = calcAllStats(target.baseStats, NEUTRAL_IVS, ZERO_EVS, targetLevel, 'Serious');

  // Offense: best damaging move it actually knows, with the real attack stat.
  let bestOffense = 0;
  for (const m of usableMoves(rec, p, moves)) {
    if (m.category === 'Status' || !m.power) continue;
    const eff = effectiveness(m.type, target.types);
    const stab = p.types.includes(m.type) ? 1.5 : 1;
    const att = m.category === 'Physical' ? cand.atk : cand.spa;
    const score = m.power * eff * stab * (att / 100);
    if (score > bestOffense) bestOffense = score;
  }

  // Defense: worst-case multiplier of the target's STAB into us.
  let worstDefense = 1;
  for (const t of target.types) {
    const mult = effectiveness(t, p.types);
    if (mult > worstDefense) worstDefense = mult;
  }
  const defenseScore = 100 / worstDefense;

  const speedAdvantage = cand.spe - threat.spe;

  return bestOffense + defenseScore * 0.5 + speedAdvantage * 0.2;
}

export function topPcCounters(
  target: Pokemon,
  records: PcPokemonRecord[],
  pokemonById: Record<string, Pokemon>,
  moves: Record<string, Move>,
  opts: PcCounterOptions,
): { results: PcCounterResult[]; underleveled: number } {
  const minLevel = opts.targetLevel * (opts.minLevelRatio ?? 0.6);
  let underleveled = 0;
  const results: PcCounterResult[] = [];

  for (const rec of records) {
    const p = pokemonById[rec.speciesId];
    if (!p || p.id === target.id) continue;
    if (rec.level < minLevel) {
      underleveled++;
      continue;
    }
    results.push({ rec, p, score: pcCounterScore(rec, p, target, opts.targetLevel, moves) });
  }

  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, opts.limit ?? 15), underleveled };
}
