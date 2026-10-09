import { describe, expect, it } from 'vitest';
import { packSpecs, playTeams } from './verify';
import type { BattlePokemonSpec } from '../lib/battle/types';

const spec = (speciesName: string, moves: string[], extra: Partial<BattlePokemonSpec> = {}): BattlePokemonSpec => ({
  speciesName,
  level: 100,
  nature: 'Adamant',
  ability: undefined,
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
  moves: moves.map((name) => ({ name })),
  ...extra,
});

describe('verification games', () => {
  it('plays whole teams to a result, and a much stronger team wins', () => {
    const strong = packSpecs([
      spec('Garchomp', ['Earthquake', 'Dragon Claw', 'Stone Edge', 'Swords Dance'], { item: 'Life Orb', ability: 'Rough Skin' }),
      spec('Kingambit', ['Kowtow Cleave', 'Iron Head', 'Sucker Punch', 'Swords Dance'], { item: 'Leftovers', ability: 'Supreme Overlord' }),
    ]);
    const weak = packSpecs([
      spec('Magikarp', ['Splash', 'Tackle'], { level: 20 }),
      spec('Feebas', ['Splash', 'Tackle'], { level: 20 }),
    ]);
    for (const seed of [1, 2]) expect(playTeams('gen9ou', strong, weak, seed)).toBe(1);
  }, 60_000);
});
