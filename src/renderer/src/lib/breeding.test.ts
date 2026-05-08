import { describe, expect, it } from 'vitest';
import type { BaseStats } from './types';
import {
  abilityDistribution,
  ivTargetProbability,
  natureDistribution,
  perfectCountDistribution,
  perStat31Probability,
  type BreedingIvConfig,
} from './breeding';

const IVS = (n: number): BaseStats => ({ hp: n, atk: n, def: n, spa: n, spd: n, spe: n });
const ALL_ANY = {
  hp: 'any',
  atk: 'any',
  def: 'any',
  spa: 'any',
  spd: 'any',
  spe: 'any',
} as const;

const cfg = (over: Partial<BreedingIvConfig>): BreedingIvConfig => ({
  femaleIvs: IVS(31),
  maleIvs: IVS(31),
  femaleItem: 'none',
  maleItem: 'none',
  ...over,
});

describe('perfectCountDistribution', () => {
  it('is a probability distribution', () => {
    const dist = perfectCountDistribution(cfg({ femaleIvs: IVS(17), maleItem: 'destiny-knot' }));
    const total = dist.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 12);
    expect(dist).toHaveLength(7);
  });

  it('two 6×31 parents + Destiny Knot: P(6×31) = 1/32 and P(≥5×31) = 1', () => {
    const dist = perfectCountDistribution(cfg({ femaleItem: 'destiny-knot' }));
    expect(dist[6]).toBeCloseTo(1 / 32, 12);
    expect(dist[5] + dist[6]).toBeCloseTo(1, 12);
  });

  it('Destiny Knot works from either parent and stacks nothing when both hold it', () => {
    const a = perfectCountDistribution(cfg({ femaleItem: 'destiny-knot' }));
    const b = perfectCountDistribution(cfg({ maleItem: 'destiny-knot' }));
    const c = perfectCountDistribution(cfg({ femaleItem: 'destiny-knot', maleItem: 'destiny-knot' }));
    expect(a[6]).toBeCloseTo(b[6], 12);
    expect(a[6]).toBeCloseTo(c[6], 12);
  });

  it('two 6×31 parents, no items: P(6×31) = (1/32)^3, P(≥5) = 94/32768', () => {
    const dist = perfectCountDistribution(cfg({}));
    expect(dist[6]).toBeCloseTo(1 / 32 ** 3, 12);
    expect(dist[5] + dist[6]).toBeCloseTo(94 / 32768, 12);
  });

  it('two 0-IV parents can never produce 4+ perfect IVs without DK (only 3 random rolls)', () => {
    const dist = perfectCountDistribution(cfg({ femaleIvs: IVS(0), maleIvs: IVS(0) }));
    expect(dist[4] + dist[5] + dist[6]).toBeCloseTo(0, 12);
    // P(0 perfect) = (31/32)^3 over the three random stats.
    expect(dist[0]).toBeCloseTo((31 / 32) ** 3, 12);
  });
});

describe('power items', () => {
  it('a single power item guarantees that stat from the holder', () => {
    const p = perStat31Probability(
      cfg({ femaleIvs: { ...IVS(0), hp: 31 }, maleIvs: IVS(0), femaleItem: 'power-hp' }),
    );
    expect(p.hp).toBeCloseTo(1, 12);
  });

  it('competing power items on the same stat resolve 50/50 by holder', () => {
    const p = perStat31Probability(
      cfg({
        femaleIvs: { ...IVS(0), hp: 31 },
        maleIvs: IVS(0),
        femaleItem: 'power-hp',
        maleItem: 'power-hp',
      }),
    );
    expect(p.hp).toBeCloseTo(0.5, 12);
  });

  it('power items on different stats: only one applies, 50/50', () => {
    const p = perStat31Probability(
      cfg({
        femaleIvs: { ...IVS(0), hp: 31 },
        maleIvs: { ...IVS(0), atk: 31 },
        femaleItem: 'power-hp',
        maleItem: 'power-atk',
      }),
    );
    // When the female's Power item wins (50%), HP=31 guaranteed; otherwise HP
    // can still be inherited randomly from the female or rolled at 31.
    expect(p.hp).toBeGreaterThan(0.5);
    expect(p.atk).toBeGreaterThan(0.5);
    expect(p.hp).toBeCloseTo(p.atk, 12);
  });
});

describe('ivTargetProbability', () => {
  it('all-any target has probability 1', () => {
    expect(ivTargetProbability(cfg({}), { ...ALL_ANY })).toBeCloseTo(1, 12);
  });

  it('matches the count distribution for a 6×31 target', () => {
    const c = cfg({ femaleItem: 'destiny-knot' });
    const viaTarget = ivTargetProbability(c, {
      hp: '31',
      atk: '31',
      def: '31',
      spa: '31',
      spd: '31',
      spe: '31',
    });
    expect(viaTarget).toBeCloseTo(perfectCountDistribution(c)[6], 12);
  });

  it('supports 0-IV targets (trick room attackers)', () => {
    const p = ivTargetProbability(cfg({ femaleIvs: IVS(0), maleIvs: IVS(0) }), {
      ...ALL_ANY,
      spe: '0',
    });
    // spe is either inherited (always 0 here) or rolled (1/32 chance of 0).
    expect(p).toBeGreaterThan(1 / 32);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('natureDistribution', () => {
  it('no everstone → fully random', () => {
    expect(natureDistribution('none', 'none', 'Adamant', 'Modest')).toEqual([
      { nature: 'random', p: 1 },
    ]);
  });

  it('one everstone passes the holder nature', () => {
    expect(natureDistribution('everstone', 'none', 'Adamant', 'Modest')).toEqual([
      { nature: 'Adamant', p: 1 },
    ]);
  });

  it('two everstones split 50/50, merging identical natures', () => {
    expect(natureDistribution('everstone', 'everstone', 'Adamant', 'Modest')).toEqual([
      { nature: 'Adamant', p: 0.5 },
      { nature: 'Modest', p: 0.5 },
    ]);
    expect(natureDistribution('everstone', 'everstone', 'Adamant', 'Adamant')).toEqual([
      { nature: 'Adamant', p: 1 },
    ]);
  });
});

describe('abilityDistribution', () => {
  const species = { abilities: ['Torrent', 'Damp'], hiddenAbilities: ['Protean'] };

  it('hidden-ability mother → 60% HA, regular split evenly', () => {
    const d = abilityDistribution(species, 'Protean');
    expect(d.find((x) => x.ability === 'Protean')?.p).toBeCloseTo(0.6, 12);
    expect(d.find((x) => x.ability === 'Torrent')?.p).toBeCloseTo(0.2, 12);
    expect(d.find((x) => x.ability === 'Damp')?.p).toBeCloseTo(0.2, 12);
  });

  it('regular mother → 80% same slot / 20% other regular, HA unreachable', () => {
    const d = abilityDistribution(species, 'Torrent');
    expect(d.find((x) => x.ability === 'Torrent')?.p).toBeCloseTo(0.8, 12);
    expect(d.find((x) => x.ability === 'Damp')?.p).toBeCloseTo(0.2, 12);
    expect(d.find((x) => x.ability === 'Protean')).toBeUndefined();
  });

  it('single regular ability species → 100% that ability', () => {
    const d = abilityDistribution({ abilities: ['Levitate'], hiddenAbilities: [] }, 'Levitate');
    expect(d).toEqual([{ ability: 'Levitate', p: 1, hidden: false }]);
  });

  it('distributions sum to 1', () => {
    for (const ab of ['Protean', 'Torrent', 'Damp']) {
      const total = abilityDistribution(species, ab).reduce((a, x) => a + x.p, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });
});
