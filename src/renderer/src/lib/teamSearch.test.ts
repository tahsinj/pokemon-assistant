import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildPool } from './bestSix';
import { viewForFormat, type DexFile } from './data';
import { FORMATS } from './formats';
import type { PcPokemonRecord } from './bridgeTypes';
import { searchTeams } from './teamSearch';
import type { TeamMon, TeamScorer } from '../ml/teamModel';

const view = viewForFormat(JSON.parse(readFileSync(new URL('../../public/data/dex.json', import.meta.url), 'utf8')) as DexFile, FORMATS.gen9ou);

const rec = (speciesId: string, i: number): PcPokemonRecord => ({
  id: `pc${i}`,
  boxId: 'b',
  slot: i,
  speciesId,
  speciesDisplay: speciesId,
  nickname: null,
  level: 100,
  gender: 'male',
  nature: 'Hardy',
  ability: '',
  item: null,
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  moves: ['Tackle'],
  notes: null,
  shiny: false,
  updatedAt: 0,
});

const box = ['garchomp', 'corviknight', 'gholdengo', 'greattusk', 'kingambit', 'dragapult', 'toxapex', 'clefable', 'heatran', 'rotomwash'];
// A made-up meta where each species is worth a fixed amount and Kingambit plus Gholdengo is a strong pair.
const worth: Record<string, number> = { garchomp: 0.06, corviknight: 0.05, gholdengo: 0.07, greattusk: 0.08, kingambit: 0.07, dragapult: 0.02, toxapex: 0.01, clefable: 0.03, heatran: 0.04, rotomwash: 0.035, ironvaliant: 0.09 };
const value = (t: TeamMon[]) => {
  const ids = t.map((m) => m.species);
  return 0.2 + ids.reduce((s, id) => s + (worth[id] ?? 0), 0) + (ids.includes('kingambit') && ids.includes('gholdengo') ? 0.05 : 0);
};
const meta: TeamMon[][] = [[{ species: 'kingambit' }], [{ species: 'greattusk' }]];
const fake: TeamScorer = {
  month: '2026-09',
  metaTeams: meta,
  async winChances(pairs) {
    return pairs.map(([a]) => value(a));
  },
  async metaScores(teams) {
    return teams.map(value);
  },
};

describe('team search with the team model', () => {
  it('finds the best six, ranks members by what they add, and suggests additions', async () => {
    const pool = buildPool(box.map(rec), view.pokemonById, view.moves, null, { legalOnly: true });
    const outside = [view.pokemonById.ironvaliant, view.pokemonById.garchomp];
    const result = await searchTeams(pool, fake, view.moves, () => true, outside);
    expect(result).not.toBeNull();
    const best = result!.candidates[0];
    expect(best.members.map((m) => m.p.id).sort()).toEqual(['corviknight', 'garchomp', 'gholdengo', 'greattusk', 'heatran', 'kingambit']);
    expect(best.metaScore).toBeCloseTo(0.2 + 0.06 + 0.05 + 0.07 + 0.08 + 0.07 + 0.04 + 0.05, 6);
    const kingambit = best.members.findIndex((m) => m.p.id === 'kingambit');
    const heatran = best.members.findIndex((m) => m.p.id === 'heatran');
    expect(best.contributions[kingambit]).toBeGreaterThan(best.contributions[heatran]);
    expect(result!.candidates.length).toBeGreaterThan(1);
    // Iron Valiant beats every member it could replace; Garchomp is already in the box.
    expect(result!.addList[0].p.id).toBe('ironvaliant');
    expect(result!.addList.some((a) => a.p.id === 'garchomp')).toBe(false);
  });
});
