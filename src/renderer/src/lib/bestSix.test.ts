import { describe, expect, it } from 'vitest';
import { buildBestTeams } from './bestSix';
import type { Move, Pokemon } from './types';
import type { PcPokemonRecord } from './bridgeTypes';
import type { SmogonBundle, SmogonSpeciesIntel } from './smogon';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOVES: Record<string, Move> = {
  earthquake: { id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical', power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [] },
  flamethrower: { id: 'flamethrower', name: 'Flamethrower', type: 'fire', category: 'Special', power: 90, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: [] },
  surf: { id: 'surf', name: 'Surf', type: 'water', category: 'Special', power: 90, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: [] },
  tackle: { id: 'tackle', name: 'Tackle', type: 'normal', category: 'Physical', power: 40, accuracy: 100, pp: 35, priority: 0, desc: '', target: 'normal', flags: ['contact'] },
  swordsdance: { id: 'swordsdance', name: 'Swords Dance', type: 'normal', category: 'Status', power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: [] },
};

const species = (id: string, types: string[], over: Partial<Pokemon> = {}): Pokemon =>
  ({
    id,
    name: id[0].toUpperCase() + id.slice(1),
    dex: 1,
    types,
    abilities: [],
    hiddenAbilities: [],
    baseStats: { hp: 80, atk: 90, def: 80, spa: 70, spd: 80, spe: 80 },
    eggGroups: [],
    height: 10,
    weight: 100,
    labels: [],
    moves: [
      { learn: '1', move: 'tackle' },
      { learn: '1', move: 'earthquake' },
      { learn: 'tm', move: 'swordsdance' },
    ],
    ...over,
  }) as Pokemon;

const MAX_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const FLAT = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const rec = (id: string, speciesId: string, level: number, over: Partial<PcPokemonRecord> = {}): PcPokemonRecord => ({
  id,
  boxId: 'b',
  slot: 0,
  speciesId,
  speciesDisplay: speciesId,
  nickname: null,
  level,
  gender: 'male',
  nature: 'Hardy',
  ability: '',
  item: null,
  ivs: { ...MAX_IVS },
  evs: { ...FLAT },
  moves: ['Tackle'],
  notes: null,
  shiny: false,
  updatedAt: 0,
  ...over,
});

// Ten distinct species so a full team of 6 is always possible.
const SPECIES_IDS = ['aron', 'bron', 'ceru', 'dolt', 'evee', 'flyn', 'gard', 'hopp', 'ivys', 'jolt'];
const pokemonById: Record<string, Pokemon> = {};
for (const id of SPECIES_IDS) pokemonById[id] = species(id, ['normal']);

const tenRecords = SPECIES_IDS.map((id, i) => rec(`r-${id}`, id, 50 + i));

const intel = (over: Partial<SmogonSpeciesIntel>): SmogonSpeciesIntel => ({
  name: 'X',
  usage: 0.05,
  rank: 50,
  abilities: [],
  items: [{ name: 'Leftovers', pct: 40 }],
  spreads: [{ nature: 'Jolly', evs: [0, 252, 0, 0, 4, 252], pct: 50 }],
  moves: [
    { name: 'Earthquake', pct: 90 },
    { name: 'Swords Dance', pct: 60 },
  ],
  teraTypes: [],
  teammates: [],
  checks: [],
  ...over,
});

const bundle = (speciesMap: Record<string, SmogonSpeciesIntel>): SmogonBundle => ({
  meta: { format: 'gen9nationaldex', label: 'NatDex OU', month: '2026-05', cutoff: 1630, battles: 1, fetchedAt: '' },
  species: speciesMap,
});

// ---------------------------------------------------------------------------

describe('buildBestTeams - pool construction', () => {
  it('excludes badly underleveled mons and counts them', () => {
    const records = [...tenRecords, rec('baby', 'aron', 3)];
    const out = buildBestTeams(records, pokemonById, MOVES, null);
    expect(out.excludedUnderleveled).toBe(1);
    for (const c of out.candidates) {
      expect(c.members.some((m) => m.rec.id === 'baby')).toBe(false);
    }
  });

  it('dedupes to the best record per species', () => {
    const records = [...tenRecords, rec('dup-high', 'aron', 58), rec('dup-low', 'aron', 51)];
    const out = buildBestTeams(records, pokemonById, MOVES, null);
    expect(out.dedupedSpecies).toBe(2);
    for (const c of out.candidates) {
      const arons = c.members.filter((m) => m.rec.speciesId === 'aron');
      expect(arons.length).toBeLessThanOrEqual(1);
      if (arons.length) expect(arons[0].rec.id).toBe('dup-high');
    }
  });

  it('excludes banned (Uber/AG) species and counts them', () => {
    const byId = { ...pokemonById, zacian: species('zacian', ['fairy']) };
    byId.zacian.natDexTier = 'Uber';
    const records = [...tenRecords, rec('uber', 'zacian', 100)];
    const out = buildBestTeams(records, byId, MOVES, null);
    expect(out.excludedBanned).toBe(1);
    for (const c of out.candidates) {
      expect(c.members.some((m) => m.rec.speciesId === 'zacian')).toBe(false);
    }
  });

  it('includes banned species when legalOnly is off', () => {
    const byId = { ...pokemonById, zacian: species('zacian', ['fairy']) };
    byId.zacian.natDexTier = 'Uber';
    const out = buildBestTeams([...tenRecords, rec('uber', 'zacian', 100)], byId, MOVES, null, {
      legalOnly: false,
    });
    expect(out.excludedBanned).toBe(0);
  });

  it('works without a smogon bundle at all', () => {
    const out = buildBestTeams(tenRecords, pokemonById, MOVES, null);
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.candidates[0].members).toHaveLength(6);
    expect(out.candidates[0].score).toBeGreaterThan(0);
  });

  it('returns a single short candidate when fewer than 6 eligible mons exist', () => {
    const out = buildBestTeams(tenRecords.slice(0, 4), pokemonById, MOVES, null);
    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.candidates[0].members).toHaveLength(4);
  });
});

describe('buildBestTeams - scoring signals', () => {
  it('chemistry pulls a co-used pair into the same team', () => {
    // aron<->bron pair heavily on the ladder; everyone else equal.
    const smogon = bundle({
      aron: intel({ teammates: [{ id: 'bron', name: 'Bron', pct: 40 }] }),
      bron: intel({ teammates: [{ id: 'aron', name: 'Aron', pct: 40 }] }),
    });
    const out = buildBestTeams(tenRecords, pokemonById, MOVES, smogon);
    const balanced = out.candidates.find((c) => c.preset === 'balanced')!;
    const ids = balanced.members.map((m) => m.rec.speciesId);
    expect(ids).toContain('aron');
    expect(ids).toContain('bron');
    expect(balanced.breakdown.chemistry).toBeGreaterThan(0);
  });

  it('the defense preset tolerates fewer stacked weaknesses than offense', () => {
    // Five fire-weak glass cannons + bulky water alternatives.
    const byId: Record<string, Pokemon> = {};
    const records: PcPokemonRecord[] = [];
    for (let i = 0; i < 6; i++) {
      const id = `grass${i}`;
      byId[id] = species(id, ['grass'], { baseStats: { hp: 60, atk: 120, def: 50, spa: 110, spd: 50, spe: 110 } });
      records.push(rec(`r-${id}`, id, 50));
    }
    for (let i = 0; i < 4; i++) {
      const id = `water${i}`;
      byId[id] = species(id, ['water'], { baseStats: { hp: 100, atk: 60, def: 110, spa: 60, spd: 110, spe: 40 } });
      records.push(rec(`r-${id}`, id, 50));
    }
    const out = buildBestTeams(records, byId, MOVES, null, { presets: ['offense', 'defense'] });
    const off = out.candidates.find((c) => c.preset === 'offense')!;
    const def = out.candidates.find((c) => c.preset === 'defense')!;
    const waterCount = (c: typeof def) => c.members.filter((m) => m.rec.speciesId.startsWith('water')).length;
    expect(waterCount(def)).toBeGreaterThanOrEqual(waterCount(off));
    expect(def.stackedWeaknesses.length).toBeLessThanOrEqual(off.stackedWeaknesses.length);
  });

  it('produces non-identical candidates (diversity guard)', () => {
    const out = buildBestTeams(tenRecords, pokemonById, MOVES, null);
    const keys = out.candidates.map((c) =>
      c.members
        .map((m) => m.rec.id)
        .sort()
        .join('|'),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('buildBestTeams - member advice', () => {
  const smogon = bundle({ aron: intel({}) });

  it('suggests nature, EV, item changes and learnable teaches from the usage marginals', () => {
    const out = buildBestTeams(
      [rec('a', 'aron', 50, { nature: 'Hardy', moves: ['Tackle', 'Surf', 'Flamethrower', 'Earthquake'] })],
      pokemonById,
      MOVES,
      smogon,
    );
    const advice = out.candidates[0].members.find((m) => m.rec.id === 'a')!;
    expect(advice.natureChange).toEqual({ from: 'Hardy', to: 'Jolly' });
    expect(advice.evTarget).not.toBeNull();
    expect(advice.evTarget!.target.atk).toBe(252);
    expect(advice.itemSuggestion?.suggested).toBe('Leftovers');
    // Swords Dance is in the usage moves and learnable (tm) but unknown -> teach.
    const teaches = advice.moveChanges.map((m) => m.teach);
    expect(teaches).toContain('Swords Dance');
    // Replacement comes from current moves not in the target (Surf/Flamethrower/Tackle).
    for (const ch of advice.moveChanges) {
      if (ch.replace) expect(['Surf', 'Flamethrower', 'Tackle']).toContain(ch.replace);
    }
  });

  it('flags underleveled members against the PC reference level', () => {
    const records = [...tenRecords, rec('low', 'jolt', 40)]; // ref ≈ 58-59
    // 'low' replaces the dedupe winner only if higher level - give it its own species.
    const byId = { ...pokemonById, lowmon: species('lowmon', ['normal']) };
    const out = buildBestTeams([...tenRecords, rec('low', 'lowmon', 40)], byId, MOVES, null, {
      poolSize: 24,
    });
    const withLow = out.candidates.find((c) => c.members.some((m) => m.rec.id === 'low'));
    if (withLow) {
      const adv = withLow.members.find((m) => m.rec.id === 'low')!;
      expect(adv.needsLeveling).not.toBeNull();
      expect(adv.needsLeveling!.current).toBe(40);
    }
  });

  it('suggests 0 Atk IVs for a special attacker', () => {
    const byId = {
      ...pokemonById,
      alakazam: species('alakazam', ['psychic'], {
        baseStats: { hp: 55, atk: 50, def: 45, spa: 135, spd: 95, spe: 120 },
      }),
    };
    const out = buildBestTeams([rec('z', 'alakazam', 50)], byId, MOVES, null);
    const adv = out.candidates[0].members.find((m) => m.rec.id === 'z')!;
    const atk = adv.ivChanges.find((c) => c.stat === 'atk');
    expect(atk).toBeTruthy();
    expect(atk!.to).toBe(0);
  });

  it('suggests 0 Speed IVs for a Trick Room user', () => {
    const byId = { ...pokemonById, bronzong: species('bronzong', ['steel', 'psychic']) };
    const out = buildBestTeams([rec('tr', 'bronzong', 50, { moves: ['Trick Room', 'Earthquake'] })], byId, MOVES, null);
    const adv = out.candidates[0].members.find((m) => m.rec.id === 'tr')!;
    expect(adv.ivChanges.some((c) => c.stat === 'spe' && c.to === 0)).toBe(true);
  });

  it('no advice targets without smogon beyond leveling', () => {
    const out = buildBestTeams(tenRecords, pokemonById, MOVES, null);
    for (const m of out.candidates[0].members) {
      expect(m.matchedSetName).toBeNull();
      expect(m.natureChange).toBeNull();
      expect(m.itemSuggestion).toBeNull();
    }
  });
});
