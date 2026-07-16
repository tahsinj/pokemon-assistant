import { describe, it, expect } from 'vitest';
import { buildGatedItemIds, gatedItemsByKind, makeItemFilter, isZCrystalName } from './itemKinds';
import type { HeldItem } from './types';

const item = (name: string, category: HeldItem['category']): HeldItem =>
  ({ id: name.toLowerCase().replace(/[^a-z0-9]/g, ''), name, category, source: 'showdown' });

const items: HeldItem[] = [
  item('Leftovers', 'held'),
  item('Eviolite', 'held'),
  item('Choice Scarf', 'held'),
  item('Charizardite Y', 'mega'),
  item('Heracronite', 'mega'),
  item('Normalium Z', 'other'),
  item('Dragonium Z', 'plate'),
  item('Sitrus Berry', 'berry'),
];

describe('item gating', () => {
  it('classifies Mega Stones (category) and Z-Crystals (name) as gated', () => {
    const gated = buildGatedItemIds(items);
    expect(gated.has('charizarditey')).toBe(true);
    expect(gated.has('heracronite')).toBe(true);
    expect(gated.has('normaliumz')).toBe(true);
    expect(gated.has('dragoniumz')).toBe(true);
  });

  it('does not gate normal/craftable items (incl. Eviolite, which ends in -ite)', () => {
    const gated = buildGatedItemIds(items);
    expect(gated.has('eviolite')).toBe(false);
    expect(gated.has('leftovers')).toBe(false);
    expect(gated.has('choicescarf')).toBe(false);
    expect(gated.has('sitrusberry')).toBe(false);
  });

  it('isZCrystalName matches " Z" suffixed names only', () => {
    expect(isZCrystalName('Normalium Z')).toBe(true);
    expect(isZCrystalName('Leftovers')).toBe(false);
    expect(isZCrystalName('Eviolite')).toBe(false);
  });

  it('splits gated items into mega and zcrystal buckets', () => {
    const { mega, zcrystal } = gatedItemsByKind(items);
    expect(mega.map((i) => i.name)).toEqual(['Charizardite Y', 'Heracronite']);
    expect(zcrystal.map((i) => i.name)).toEqual(['Dragonium Z', 'Normalium Z']);
  });

  it('makeItemFilter allows normal items, gates unowned, permits owned', () => {
    const gated = buildGatedItemIds(items);
    const allow = makeItemFilter(gated, new Set(['heracronite']));
    expect(allow('Leftovers')).toBe(true);       // normal
    expect(allow('Charizardite Y')).toBe(false); // gated, not owned
    expect(allow('Heracronite')).toBe(true);     // gated, owned
  });
});
