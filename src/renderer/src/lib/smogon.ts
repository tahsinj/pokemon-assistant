/**
 * Per-format usage bundle - produced by `npm run fetch-usage`
 * (scripts/fetch-usage.mjs) into public/data/usage/<format>.json. Keyed by
 * Showdown species id; percentages are rating-weighted shares of the ladder
 * population. Optional: every consumer must work when absent.
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
    /** Stats month ("2026-05") when the source records it. */
    month?: string;
    /** Rating cutoff when the source records it. */
    cutoff?: number;
    source?: string;
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
/** "2026-05", or "latest" when the bundle does not record a month. */
export function usagePeriod(meta: SmogonBundle['meta']): string {
  return meta.month ?? 'latest';
}

export async function loadUsage(format: string): Promise<SmogonBundle | null> {
  let text: string;
  try {
    const r = await fetch(`./data/usage/${format}.json`);
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
