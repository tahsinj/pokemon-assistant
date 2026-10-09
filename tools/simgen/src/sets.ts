/**
 * Sets to simulate: drawn from a format's usage data, plus off-meta variants
 * (odd spreads, a weaker move, no item) so the Pokémon in a casual box still
 * get sensible scores.
 */
import { Dex, toID, type PokemonSet } from '@pkmn/sim';
import type { CandidateSet } from '../../../src/renderer/src/lib/battle/predictor/types';
import type { BattlePokemonSpec } from '../../../src/renderer/src/lib/battle/types';
import type { SmogonBundle } from '../../../src/renderer/src/lib/smogon';
import type { Pokemon } from '../../../src/renderer/src/lib/types';

export type Rand = () => number;

export interface SampledSet {
  set: PokemonSet;
  /** What was changed from the usage set, or "" for none. */
  variant: '' | 'spread' | 'move' | 'item';
}

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

function weighted<T>(items: T[], weight: (t: T) => number, rand: Rand): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = rand() * total;
  for (const t of items) {
    r -= weight(t);
    if (r <= 0) return t;
  }
  return items[items.length - 1];
}

function shuffle<T>(items: T[], rand: Rand): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class SetSampler {
  private readonly species: { id: string; usage: number }[];

  constructor(
    private readonly usage: SmogonBundle,
    private readonly pool: Record<string, CandidateSet[]>,
    private readonly pokemonById: Record<string, Pokemon>,
  ) {
    this.species = Object.entries(usage.species)
      .filter(([id]) => pool[id]?.length && pokemonById[id] && !pokemonById[id].banned)
      .map(([id, s]) => ({ id, usage: s.usage }));
  }

  get size(): number {
    return this.species.length;
  }

  /** A species by usage weight, then one of its sets by prior; `offMeta` is the chance of a variant. */
  sample(rand: Rand, offMeta: number): SampledSet {
    const { id } = weighted(this.species, (s) => s.usage, rand);
    const c = weighted(this.pool[id], (s) => s.prior, rand);
    const intel = this.usage.species[id];
    const moves = shuffle(c.moves, rand).slice(0, 4);
    for (const m of intel.moves) {
      if (moves.length >= 4) break;
      if (!moves.some((x) => toID(x) === toID(m.name))) moves.push(m.name);
    }
    const set: PokemonSet = {
      name: Dex.species.get(id).name,
      species: Dex.species.get(id).name,
      item: c.item ?? '',
      ability: c.ability || intel.abilities[0]?.name || Dex.species.get(id).abilities[0],
      moves,
      nature: c.nature,
      gender: '',
      evs: { ...c.evs },
      ivs: { ...c.ivs },
      level: 100,
      teraType: c.teraType ?? undefined,
    };
    if (rand() >= offMeta) return { set, variant: '' };
    const kind = weighted(['spread', 'move', 'item'] as const, () => 1, rand);
    if (kind === 'spread') {
      const [x, y, z] = shuffle([...STATS], rand);
      set.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, [x]: 252, [y]: 252, [z]: 4 };
      set.nature = weighted(['Hardy', 'Serious', 'Bold', 'Brave', 'Lax', 'Relaxed'], () => 1, rand);
    } else if (kind === 'move') {
      const learnable = this.pokemonById[id].moves.map((m) => m.move).filter((m) => Dex.moves.get(m).exists);
      if (learnable.length) set.moves[Math.floor(rand() * set.moves.length)] = Dex.moves.get(learnable[Math.floor(rand() * learnable.length)]).name;
    } else {
      set.item = '';
    }
    return { set, variant: kind };
  }
}

/** Calc input for a set at full HP. */
export function specOf(set: PokemonSet): BattlePokemonSpec {
  return {
    speciesName: set.species,
    level: set.level || 100,
    nature: set.nature || 'Hardy',
    ability: set.ability || undefined,
    item: set.item || undefined,
    teraType: set.teraType || undefined,
    ivs: Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, set.ivs),
    evs: Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, set.evs),
    moves: set.moves.map((name) => ({ name })),
    currentHPPercent: 100,
    boosts: {},
  };
}
