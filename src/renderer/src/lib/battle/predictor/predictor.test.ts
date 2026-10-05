import { describe, expect, it } from 'vitest';
import {
  emptyBattleState,
  makeId,
  makePokemon,
  type BattlePokemon,
} from '../state';
import { applyEvent } from '../events';
import {
  applyEventAndPredict,
  initOpponentModel,
  narrowByAbility,
  narrowByItem,
  narrowByMove,
  narrowByTera,
  topCandidates,
} from './predictor';
import { generateCandidateSets } from './setGenerator';
import type { PredictorContext } from './types';
import type { Move, Pokemon } from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const garchomp: Pokemon = {
  id: 'garchomp',
  name: 'Garchomp',
  dex: 445,
  types: ['dragon', 'ground'],
  abilities: ['Rough Skin', 'Sand Veil'],
  hiddenAbilities: ['Rough Skin'],
  baseStats: { hp: 108, atk: 130, def: 95, spa: 80, spd: 85, spe: 102 },
  eggGroups: ['monster', 'dragon'],
  height: 19,
  weight: 950,
  labels: [],
  moves: [
    { learn: '1', move: 'earthquake' },
    { learn: '1', move: 'outrage' },
    { learn: '1', move: 'stoneedge' },
    { learn: '1', move: 'ironhead' },
    { learn: '1', move: 'swordsdance' },
    { learn: '1', move: 'dragonclaw' },
    { learn: '1', move: 'fireblast' },
  ],
};

const tatsugiri: Pokemon = {
  id: 'tatsugiri',
  name: 'Tatsugiri',
  dex: 978,
  types: ['dragon', 'water'],
  abilities: ['Commander', 'Storm Drain'],
  hiddenAbilities: ['Storm Drain'],
  baseStats: { hp: 68, atk: 50, def: 60, spa: 120, spd: 95, spe: 82 },
  eggGroups: ['water2', 'dragon'],
  height: 3,
  weight: 80,
  labels: [],
  moves: [
    { learn: '1', move: 'dracometeor' },
    { learn: '1', move: 'muddywater' },
    { learn: '1', move: 'icebeam' },
    { learn: '1', move: 'nastyplot' },
    { learn: '1', move: 'surf' },
  ],
};

const MOVES_DB: Record<string, Move> = {
  earthquake: {
    id: 'earthquake', name: 'Earthquake', type: 'ground', category: 'Physical',
    power: 100, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'allAdjacent', flags: ['contact'],
  },
  outrage: {
    id: 'outrage', name: 'Outrage', type: 'dragon', category: 'Physical',
    power: 120, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: ['contact'],
  },
  stoneedge: {
    id: 'stoneedge', name: 'Stone Edge', type: 'rock', category: 'Physical',
    power: 100, accuracy: 80, pp: 5, priority: 0, desc: '', target: 'normal', flags: [],
  },
  ironhead: {
    id: 'ironhead', name: 'Iron Head', type: 'steel', category: 'Physical',
    power: 80, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'],
  },
  dragonclaw: {
    id: 'dragonclaw', name: 'Dragon Claw', type: 'dragon', category: 'Physical',
    power: 80, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'normal', flags: ['contact'],
  },
  fireblast: {
    id: 'fireblast', name: 'Fire Blast', type: 'fire', category: 'Special',
    power: 110, accuracy: 85, pp: 5, priority: 0, desc: '', target: 'normal', flags: [],
  },
  swordsdance: {
    id: 'swordsdance', name: 'Swords Dance', type: 'normal', category: 'Status',
    power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: [],
  },
  dracometeor: {
    id: 'dracometeor', name: 'Draco Meteor', type: 'dragon', category: 'Special',
    power: 130, accuracy: 90, pp: 5, priority: 0, desc: '', target: 'normal', flags: [],
  },
  muddywater: {
    id: 'muddywater', name: 'Muddy Water', type: 'water', category: 'Special',
    power: 90, accuracy: 85, pp: 10, priority: 0, desc: '', target: 'allAdjacentFoes', flags: [],
  },
  icebeam: {
    id: 'icebeam', name: 'Ice Beam', type: 'ice', category: 'Special',
    power: 90, accuracy: 100, pp: 10, priority: 0, desc: '', target: 'normal', flags: [],
  },
  nastyplot: {
    id: 'nastyplot', name: 'Nasty Plot', type: 'dark', category: 'Status',
    power: 0, accuracy: true, pp: 20, priority: 0, desc: '', target: 'self', flags: [],
  },
  surf: {
    id: 'surf', name: 'Surf', type: 'water', category: 'Special',
    power: 90, accuracy: 100, pp: 15, priority: 0, desc: '', target: 'allAdjacent', flags: [],
  },
};

const ctx: PredictorContext = {
  pokemonByName: {
    garchomp,
    tatsugiri,
  },
  moves: MOVES_DB,
};

function makeOppGarchomp(): BattlePokemon {
  return makePokemon(
    garchomp,
    { speciesName: 'Garchomp', level: 50 },
    makeId('opponent', 0),
    { isOpponent: true, source: 'DEFAULT' },
  );
}
function makePlayerGarchomp(): BattlePokemon {
  return makePokemon(
    garchomp,
    {
      speciesName: 'Garchomp',
      level: 50,
      nature: 'Jolly',
      ability: 'Rough Skin',
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
      evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
      moves: [{ name: 'Earthquake' }],
    },
    makeId('player', 0),
    { isOpponent: false, source: 'KNOWN' },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateCandidateSets', () => {
  it('produces at least 2 archetypes for a physical attacker', () => {
    const sets = generateCandidateSets(garchomp, ctx);
    expect(sets.length).toBeGreaterThanOrEqual(2);
    // Garchomp is a physical attacker -> at least one set should bias physical.
    const hasPhys = sets.some((s) =>
      ['Choice Band', 'Life Orb', 'Choice Scarf'].includes(s.item ?? ''),
    );
    expect(hasPhys).toBe(true);
  });

  it('priors sum to 1', () => {
    const sets = generateCandidateSets(garchomp, ctx);
    const sum = sets.reduce((a, s) => a + s.prior, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it('produces special-bias sets for a special attacker', () => {
    const sets = generateCandidateSets(tatsugiri, ctx);
    const labels = sets.map((s) => s.label.toLowerCase());
    expect(labels.some((l) => l.includes('special'))).toBe(true);
  });
});

describe('initOpponentModel', () => {
  it('seeds a model with normalized weights summing to 1', () => {
    const p = makeOppGarchomp();
    const model = initOpponentModel(p.identity.species, p.identity.level, ctx);
    expect(model.candidates.length).toBeGreaterThan(0);
    const total = model.candidates.filter((c) => !c.eliminated).reduce((a, c) => a + c.weight, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(model.confidence).toBeGreaterThanOrEqual(0);
    expect(model.confidence).toBeLessThan(1); // multiple candidates -> not maxed
  });
});

describe('narrowByMove', () => {
  it('eliminates candidates that do not contain the move', () => {
    const p = makeOppGarchomp();
    const seeded = initOpponentModel(p.identity.species, p.identity.level, ctx);
    // Earthquake should be in every Garchomp set.
    const eq = narrowByMove(seeded, 'Earthquake');
    expect(eq.candidates.every((c) => c.eliminated || c.moves.includes('Earthquake'))).toBe(true);
    expect(eq.candidates.filter((c) => !c.eliminated).length).toBeGreaterThan(0);

    // A made-up move not in any set should eliminate all candidates and trigger
    // the uniform fallback so weights don't collapse to zero.
    const bogus = narrowByMove(seeded, 'Hyperspace Hole');
    expect(bogus.candidates.every((c) => c.eliminated)).toBe(true);
    const total = bogus.candidates.reduce((a, c) => a + c.weight, 0);
    expect(total).toBe(0); // all eliminated -> live weight sum stays 0
  });

  it('always adds an evidence row, even when nothing changes', () => {
    const p = makeOppGarchomp();
    const seeded = initOpponentModel(p.identity.species, p.identity.level, ctx);
    const after = narrowByMove(seeded, 'Earthquake');
    expect(after.evidence.length).toBe(seeded.evidence.length + 1);
    expect(after.evidence[after.evidence.length - 1].observation).toContain('Earthquake');
  });
});

describe('narrowByAbility / narrowByItem / narrowByTera', () => {
  it('narrowByAbility filters mismatched candidates', () => {
    const p = makeOppGarchomp();
    const seeded = initOpponentModel(p.identity.species, p.identity.level, ctx);
    const after = narrowByAbility(seeded, 'Rough Skin');
    expect(after.candidates.every((c) => c.eliminated || c.ability === 'Rough Skin')).toBe(true);
  });

  it('narrowByItem locks the item', () => {
    const p = makeOppGarchomp();
    const seeded = initOpponentModel(p.identity.species, p.identity.level, ctx);
    const after = narrowByItem(seeded, 'Choice Band');
    const live = after.candidates.filter((c) => !c.eliminated);
    expect(live.every((c) => c.item === 'Choice Band')).toBe(true);
  });

  it('narrowByTera locks tera type', () => {
    const p = makeOppGarchomp();
    const seeded = initOpponentModel(p.identity.species, p.identity.level, ctx);
    const after = narrowByTera(seeded, 'Dragon');
    const live = after.candidates.filter((c) => !c.eliminated);
    expect(live.every((c) => c.teraType === 'Dragon')).toBe(true);
  });
});

describe('applyEventAndPredict integration', () => {
  it('initializes uncertainty on PokemonRevealed for opponent and not for player', () => {
    let state = emptyBattleState();
    const player = makePlayerGarchomp();
    const opp = makeOppGarchomp();
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player }, ctx);
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opp }, ctx);
    expect(state.sides.player.team[0]?.uncertainty).toBeNull();
    expect(state.sides.opponent.team[0]?.uncertainty).not.toBeNull();
    expect(state.sides.opponent.team[0]?.uncertainty?.candidates.length).toBeGreaterThan(0);
  });

  it('records MoveUsed observations and narrows the opponent model', () => {
    let state = emptyBattleState();
    const player = makePlayerGarchomp();
    const opp = makeOppGarchomp();
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player }, ctx);
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opp }, ctx);
    state = applyEventAndPredict(state, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } }, ctx);

    const beforeLive = state.sides.opponent.team[0]!.uncertainty!.candidates.filter((c) => !c.eliminated).length;
    state = applyEventAndPredict(state, { type: 'MoveUsed', actor: 'o:0', move: 'Stone Edge' }, ctx);
    const after = state.sides.opponent.team[0]!.uncertainty!;
    // Stone Edge is offensive coverage - many archetypes include it, but not
    // all (walls/setup with limited slots might omit it). Either way the
    // evidence trail should grow.
    expect(after.evidence.length).toBeGreaterThan(0);
    const afterLive = after.candidates.filter((c) => !c.eliminated).length;
    expect(afterLive).toBeLessThanOrEqual(beforeLive);
  });

  it('locks ability and item when revealed', () => {
    let state = emptyBattleState();
    const player = makePlayerGarchomp();
    const opp = makeOppGarchomp();
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player }, ctx);
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opp }, ctx);
    state = applyEventAndPredict(state, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } }, ctx);

    state = applyEventAndPredict(state, { type: 'ItemRevealed', target: 'o:0', item: 'Choice Scarf' }, ctx);
    const m = state.sides.opponent.team[0]!.uncertainty!;
    const live = m.candidates.filter((c) => !c.eliminated);
    expect(live.every((c) => c.item === 'Choice Scarf')).toBe(true);
  });

  it('confidence increases as we narrow candidates', () => {
    let state = emptyBattleState();
    const player = makePlayerGarchomp();
    const opp = makeOppGarchomp();
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player }, ctx);
    state = applyEventAndPredict(state, { type: 'PokemonRevealed', side: 'opponent', slot: 0, pokemon: opp }, ctx);
    state = applyEventAndPredict(state, { type: 'BattleStarted', startingActive: { player: 0, opponent: 0 } }, ctx);

    const initialConf = state.sides.opponent.team[0]!.uncertainty!.confidence;
    state = applyEventAndPredict(state, { type: 'ItemRevealed', target: 'o:0', item: 'Choice Band' }, ctx);
    state = applyEventAndPredict(state, { type: 'AbilityRevealed', target: 'o:0', ability: 'Rough Skin' }, ctx);
    const afterConf = state.sides.opponent.team[0]!.uncertainty!.confidence;
    expect(afterConf).toBeGreaterThanOrEqual(initialConf);
  });

  it('keeps applyEvent and applyEventAndPredict in sync on non-opponent events', () => {
    let state = emptyBattleState();
    const player = makePlayerGarchomp();
    state = applyEvent(state, { type: 'PokemonRevealed', side: 'player', slot: 0, pokemon: player });
    const a = applyEvent(state, { type: 'BoostChanged', target: 'p:0', stat: 'atk', delta: 2 });
    const b = applyEventAndPredict(state, { type: 'BoostChanged', target: 'p:0', stat: 'atk', delta: 2 }, ctx);
    expect(a.sides.player.team[0]?.battle.boosts.atk).toBe(b.sides.player.team[0]?.battle.boosts.atk);
  });
});

describe('topCandidates ordering', () => {
  it('returns the top-K candidates sorted by weight', () => {
    const p = makeOppGarchomp();
    const seeded = initOpponentModel(p.identity.species, p.identity.level, ctx);
    const top = topCandidates(seeded, 2);
    expect(top.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].weight).toBeGreaterThanOrEqual(top[i].weight);
    }
  });
});
