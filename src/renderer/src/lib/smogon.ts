/**
 * NatDex OU competitive intel bundle - produced by `npm run fetch-smogon`
 * (scripts/fetch-smogon.mjs) into public/data/smogon.json. Filtered to species
 * present in the Cobblemon dataset; percentages are rating-weighted shares of
 * the ladder population. Optional: every consumer must work when absent.
 */

export interface SmogonStatShare {
  name: string;
  pct: number;
}

export interface SmogonSpread {
  nature: string;
  /** [hp, atk, def, spa, spd, spe] */
  evs: number[];
  pct: number;
}

export interface SmogonTeammate {
  id: string;
  name: string;
  pct: number;
}

export interface SmogonCheck {
  id: string;
  name: string;
  /** Matchup rating 0..1 - fraction of encounters the check KOs or forces out. */
  score: number;
}

export interface SmogonSet {
  /** 4 slots; each slot lists slash options in dex order. */
  moves: string[][];
  item: string[];
  ability: string | null;
  nature: string | null;
  /** [hp, atk, def, spa, spd, spe] */
  evs: number[];
  ivs?: number[];
  teraType?: string;
  description?: string;
}

export interface SmogonSpeciesIntel {
  name: string;
  usage: number;
  rank: number;
  abilities: SmogonStatShare[];
  items: SmogonStatShare[];
  spreads: SmogonSpread[];
  moves: SmogonStatShare[];
  teraTypes: SmogonStatShare[];
  teammates: SmogonTeammate[];
  checks: SmogonCheck[];
  sets?: Record<string, SmogonSet>;
}

export interface SmogonBundle {
  meta: {
    format: string;
    label: string;
    month: string;
    cutoff: number;
    battles: number;
    fetchedAt: string;
  };
  species: Record<string, SmogonSpeciesIntel>;
}

/**
 * Load the bundle; resolves null when the file is missing or malformed
 * (absence looks different per environment - 404, file:// TypeError, or the
 * SPA fallback serving index.html - all are silent no-ops).
 */
export async function loadSmogon(): Promise<SmogonBundle | null> {
  let text: string;
  try {
    const r = await fetch('./data/smogon.json');
    if (!r.ok) return null;
    text = await r.text();
  } catch {
    return null;
  }
  if (!text.trim() || text.trimStart().startsWith('<')) return null;
  try {
    const bundle = JSON.parse(text) as SmogonBundle;
    return bundle?.species ? bundle : null;
  } catch {
    return null;
  }
}
