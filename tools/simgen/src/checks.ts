/**
 * Feature rows for Smogon's checks and counters, so the matchup model can be
 * scored against them: for every species with a checks list, each listed
 * check (as side A) against that species (side B), using both species'
 * likeliest usage sets. No battles are played.
 */
import { Dex, type PokemonSet } from '@pkmn/sim';
import type { CandidateSet } from '../../../src/renderer/src/lib/battle/predictor/types';
import type { SmogonBundle } from '../../../src/renderer/src/lib/smogon';
import { featureVector, matchupFeatures } from '../../../src/renderer/src/ml/matchupFeatures';
import { specOf } from './sets';

export interface CheckRow {
  target: string;
  check: string;
  /** Smogon's matchup rating for the check against the target, 0 to 1. */
  score: number;
  features: number[];
}

function likeliest(id: string, pool: Record<string, CandidateSet[]>, usage: SmogonBundle): PokemonSet | null {
  const c = (pool[id] ?? []).reduce<CandidateSet | null>((a, b) => (!a || b.prior > a.prior ? b : a), null);
  if (!c) return null;
  const name = Dex.species.get(id).name;
  const moves = c.moves.slice(0, 4);
  for (const m of usage.species[id]?.moves ?? []) {
    if (moves.length >= 4) break;
    if (!moves.includes(m.name)) moves.push(m.name);
  }
  return {
    name,
    species: name,
    item: c.item ?? '',
    ability: c.ability,
    moves,
    nature: c.nature,
    gender: '',
    evs: { ...c.evs },
    ivs: { ...c.ivs },
    level: 100,
    teraType: c.teraType ?? undefined,
  };
}

export function checkRows(usage: SmogonBundle, pool: Record<string, CandidateSet[]>): CheckRow[] {
  const rows: CheckRow[] = [];
  for (const [id, intel] of Object.entries(usage.species)) {
    const target = likeliest(id, pool, usage);
    if (!target || intel.checks.length < 3) continue;
    for (const check of intel.checks) {
      const set = likeliest(check.id, pool, usage);
      if (!set) continue;
      rows.push({
        target: target.species,
        check: set.species,
        score: check.score,
        features: featureVector(matchupFeatures(specOf(set), specOf(target))),
      });
    }
  }
  return rows;
}
