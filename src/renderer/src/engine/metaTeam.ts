/** A plausible team for the active format, sampled from usage stats. */
import type { SmogonBundle, SmogonSpeciesIntel } from '../lib/smogon';
import type { Pokemon } from '../lib/types';

const STATS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

function spread(label: string, values: number[] | undefined, skip: number): string | null {
  if (!values) return null;
  const parts = values.flatMap((v, i) => (v !== skip ? [`${v} ${STATS[i]}`] : []));
  return parts.length ? `${label}: ${parts.join(' / ')}` : null;
}

/** One species as a Showdown export block: its first sample set, or its most used options. */
function block(intel: SmogonSpeciesIntel): string {
  const set = Object.values(intel.sets ?? {})[0];
  const lines: string[] = [];
  if (set) {
    lines.push(set.item[0] ? `${intel.name} @ ${set.item[0]}` : intel.name);
    if (set.ability) lines.push(`Ability: ${set.ability}`);
    if (set.teraType) lines.push(`Tera Type: ${set.teraType}`);
    const evs = spread('EVs', set.evs, 0);
    if (evs) lines.push(evs);
    const ivs = spread('IVs', set.ivs, 31);
    if (ivs) lines.push(ivs);
    if (set.nature) lines.push(`${set.nature} Nature`);
    for (const slot of set.moves) if (slot[0]) lines.push(`- ${slot[0]}`);
  } else {
    const top = intel.spreads[0];
    lines.push(intel.items[0] ? `${intel.name} @ ${intel.items[0].name}` : intel.name);
    if (intel.abilities[0]) lines.push(`Ability: ${intel.abilities[0].name}`);
    const evs = spread('EVs', top?.evs, 0);
    if (evs) lines.push(evs);
    if (top?.nature) lines.push(`${top.nature} Nature`);
    for (const m of intel.moves.slice(0, 4)) lines.push(`- ${m.name}`);
  }
  return lines.join('\n');
}

/**
 * Six species drawn by usage weight, one per base species, skipping anything
 * the format bans. Returns Showdown export text.
 */
export function sampleMetaTeam(smogon: SmogonBundle, pokemon: Pokemon[], rand: () => number = Math.random): string {
  const byId = new Map(pokemon.map((p) => [p.id, p]));
  const pool = Object.entries(smogon.species).filter(([id]) => {
    const p = byId.get(id);
    return p && !p.banned;
  });
  const picked: SmogonSpeciesIntel[] = [];
  const bases = new Set<string>();
  while (picked.length < 6 && pool.length) {
    const total = pool.reduce((sum, [, s]) => sum + s.usage, 0);
    let r = rand() * total;
    let i = 0;
    while (i < pool.length - 1 && r > pool[i][1].usage) r -= pool[i++][1].usage;
    const [id, intel] = pool.splice(i, 1)[0];
    const p = byId.get(id)!;
    const base = p.baseSpecies ?? p.name;
    if (bases.has(base)) continue;
    bases.add(base);
    picked.push(intel);
  }
  return picked.map(block).join('\n\n');
}
