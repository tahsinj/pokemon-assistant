import { describe, expect, it } from 'vitest';
import { exportShowdownFromParsed, exportShowdownFromPc, parseShowdownTeam } from './showdownTeam';

describe('exportShowdownFromParsed', () => {
  const mon = {
    species: 'Garchomp',
    ability: 'Rough Skin',
    nature: 'Jolly',
    level: 100,
    evs: { atk: 252, spe: 252 },
    ivs: {},
    moves: ['Earthquake'],
    rawSpeciesLine: 'Garchomp',
  };

  it('omits Level: 100 by default (Showdown UI convention)', () => {
    const text = exportShowdownFromParsed([mon]);
    expect(text).not.toMatch(/^Level:/m);
  });

  it('includes Level: 100 when includeLevelAlways is set', () => {
    const text = exportShowdownFromParsed([mon], { includeLevelAlways: true });
    expect(text).toContain('Level: 100');
  });

  it('includes non-100 levels without includeLevelAlways', () => {
    const text = exportShowdownFromParsed([{ ...mon, level: 50 }]);
    expect(text).toContain('Level: 50');
  });
});

describe('exportShowdownFromPc', () => {
  it('includes Level: 100 for PC round-trip', () => {
    const text = exportShowdownFromPc([
      {
        speciesDisplay: 'Garchomp',
        nickname: null,
        level: 100,
        gender: 'male',
        nature: 'Jolly',
        ability: 'Rough Skin',
        item: null,
        ivs: {},
        evs: { atk: 252, spe: 252 },
        moves: ['Earthquake'],
      },
    ]);
    expect(text).toContain('Level: 100');
    const parsed = parseShowdownTeam(text, { maxMons: 1 });
    expect(parsed[0]?.level).toBe(100);
  });
});
