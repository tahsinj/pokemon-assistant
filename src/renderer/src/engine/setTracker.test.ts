import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Dex, Teams, toID, type PokemonSet } from '@pkmn/sim';
import { Engine, packTeam, playOut, randomTeam, seedFrom } from './engine';
import { greedyBot } from './bots/greedy';
import { clientField, clientSpec } from './clientSpec';
import { setViews, trackSets } from './setTracker';
import { sampleMetaTeam } from './metaTeam';
import { seededRandom } from './bots/random';
import { calcDamage } from '../lib/battle/damage';
import { viewForFormat, type DexFile } from '../lib/data';
import { FORMATS } from '../lib/formats';
import type { SmogonBundle } from '../lib/smogon';
import type { Pokemon } from '../lib/types';
import { buildSmogonSetPool } from '../lib/battle/predictor/smogonPriors';
import type { CandidateSet, PredictorContext } from '../lib/battle/predictor/types';
import { assumeOpponentSet, formatOutgoing, formatSetDistribution } from '../lib/battle/search/explain';

const ivs = (s: PokemonSet) => Object.assign({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, s.ivs);
const evs = (s: PokemonSet) => Object.assign({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, s.evs);

/** The real set, plus look-alikes that differ in one thing the battle can reveal. */
function poolFor(set: PokemonSet): CandidateSet[] {
  const truth: CandidateSet = {
    id: 'truth',
    label: 'truth',
    nature: set.nature || 'Hardy',
    ability: set.ability,
    item: set.item || null,
    teraType: set.teraType || null,
    ivs: ivs(set),
    evs: evs(set),
    moves: set.moves,
    prior: 1,
  };
  const weak = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  return [
    truth,
    { ...truth, id: 'no-investment', ivs: { hp: 31, atk: 0, def: 31, spa: 0, spd: 31, spe: 31 }, evs: weak },
    { ...truth, id: 'all-in', nature: 'Adamant', evs: { ...weak, atk: 252, spa: 252 } },
    { ...truth, id: 'other-moves', moves: ['Splash', 'Celebrate', 'Hold Hands', 'Teleport'] },
    { ...truth, id: 'other-item', item: toID(set.item) === 'leftovers' ? 'Choice Band' : 'Leftovers' },
  ];
}

/** Greedy against greedy on two random teams; returns the battle and both teams' sets. */
function playGame(n: number) {
  const p1 = randomTeam('gen9randombattle', seedFrom(n + 100));
  const p2 = randomTeam('gen9randombattle', seedFrom(n + 200));
  const engine = Engine.start({ format: 'gen9ou', seed: seedFrom(n), p1: { name: 'A', team: p1 }, p2: { name: 'B', team: p2 } });
  playOut(engine, (side, req) => greedyBot.choose(engine, side, req));
  return { engine, p1Sets: Teams.unpack(p1)!, p2Sets: Teams.unpack(p2)! };
}

function truthContext(sets: PokemonSet[]): PredictorContext {
  const pokemonByName: Record<string, Pokemon> = {};
  const customSetPool: Record<string, CandidateSet[]> = {};
  for (const set of sets) {
    const { id, name } = Dex.species.get(set.species);
    pokemonByName[name.toLowerCase()] = { id, name } as Pokemon;
    customSetPool[id] = poolFor(set);
  }
  return { pokemonByName, moves: {}, customSetPool };
}

describe('trackSets with known foe sets', () => {
  it('never rules out the real set, and damage rules out wrong spreads', () => {
    let damageEliminations = 0;
    let moveEliminations = 0;
    for (let n = 1; n <= 30; n++) {
      const { engine, p1Sets, p2Sets } = playGame(n);
      const { models, battle } = trackSets(engine.linesFor('p1'), 'p1', truthContext(p2Sets), p1Sets);
      expect(models.size, `game ${n}`).toBeLessThanOrEqual(6);
      for (const p of battle.p2.team) if (p.originalIdent) expect(models.has(p.originalIdent), `game ${n} ${p.originalIdent}`).toBe(true);
      for (const [ident, model] of models) {
        const truth = model.candidates.find((c) => c.id === 'truth');
        expect(truth?.eliminated, `game ${n} ${ident}: ${truth?.eliminatedReason}`).toBe(false);
        for (const c of model.candidates) {
          if (!c.eliminated) continue;
          if (c.eliminatedReason?.includes('dealt')) damageEliminations++;
          if (c.id === 'other-moves') moveEliminations++;
        }
      }
    }
    expect(damageEliminations).toBeGreaterThan(20);
    expect(moveEliminations).toBeGreaterThan(20);
  }, 60_000);

  it('works from the p2 seat too', () => {
    const { engine, p1Sets, p2Sets } = playGame(3);
    const { models } = trackSets(engine.linesFor('p2'), 'p2', truthContext(p1Sets), p2Sets);
    expect(models.size).toBeGreaterThan(0);
    for (const model of models.values()) {
      expect(model.candidates.find((c) => c.id === 'truth')?.eliminated).toBe(false);
    }
  });

  it('uses reveals only, not damage, when your own sets are unknown', () => {
    const { engine, p2Sets } = playGame(5);
    const { models } = trackSets(engine.linesFor('spectator'), 'p1', truthContext(p2Sets));
    for (const model of models.values()) {
      expect(model.candidates.some((c) => c.eliminatedReason?.includes('dealt'))).toBe(false);
      expect(model.candidates.find((c) => c.id === 'truth')?.eliminated).toBe(false);
    }
  });
});

describe('trackSets with usage priors, feeding the explanations', () => {
  const data = (path: string) => JSON.parse(readFileSync(new URL(`../../public/data/${path}`, import.meta.url), 'utf8'));
  const view = viewForFormat(data('dex.json') as DexFile, FORMATS.gen9ou);
  const usage = data('usage/gen9ou.json') as SmogonBundle;
  const pokemonByName: Record<string, Pokemon> = {};
  for (const p of view.pokemon) pokemonByName[p.name.toLowerCase()] = p;
  const ctx: PredictorContext = { pokemonByName, moves: view.moves, customSetPool: buildSmogonSetPool(usage, view.pokemonById) };

  const p1 = sampleMetaTeam(usage, view.pokemon, seededRandom(1));
  const p2 = sampleMetaTeam(usage, view.pokemon, seededRandom(2));
  const engine = Engine.start({ format: 'gen9ou', seed: seedFrom(9), p1: { name: 'A', team: p1 }, p2: { name: 'B', team: p2 } });
  playOut(engine, (side, req) => greedyBot.choose(engine, side, req));
  const lines = engine.linesFor('p1');
  const { models, battle } = trackSets(lines, 'p1', ctx, Teams.unpack(packTeam(p1)!)!);

  it('keeps every revealed move in each live candidate', () => {
    expect(models.size).toBe(6);
    for (const foe of battle.p2.team) {
      const model = models.get(foe.originalIdent || `preview:${Dex.species.get(foe.speciesForme.replace(/-\*$/, '')).baseSpecies}`)!;
      expect(model.candidates.length, foe.speciesForme).toBeGreaterThan(0);
      const live = model.candidates.filter((c) => !c.eliminated);
      const revealed = foe.moveSlots.filter((m) => !m.virtual).map((m) => m.id as string);
      // When every candidate is ruled out the predictor falls back to all of them.
      if (live.length === model.candidates.length && revealed.length) continue;
      for (const c of live) {
        const ids = c.moves.map((m) => toID(m));
        for (const m of revealed) expect(ids, `${foe.speciesForme} ${c.label}`).toContain(m);
      }
    }
  });

  it('gives the explanation helpers set views and calcs from client state', () => {
    // Rewind to the first turn with both actives out.
    const turn1 = lines.findIndex((l) => l === '|turn|1');
    const early = trackSets(lines.slice(0, turn1 + 1), 'p1', ctx, Teams.unpack(packTeam(p1)!)!);
    const us = early.battle.p1.active[0]!;
    const them = early.battle.p2.active[0]!;
    const model = early.models.get(them.originalIdent)!;
    const views = setViews(model);
    expect(views.length).toBeGreaterThan(0);
    expect(views[0].weight).toBeGreaterThan(0);
    expect(formatSetDistribution(views)).toContain(views[0].set!.label);
    expect(assumeOpponentSet(views)[0].text).toContain(views[0].set!.label);

    const attacker = clientSpec(us);
    expect(attacker.moves.length).toBe(4);
    const defender = clientSpec(them, views[0].set!);
    const outcome = calcDamage(9, attacker, defender, attacker.moves[0].name, clientField(early.battle, 'p1'));
    expect(outcome.error).toBeUndefined();
    expect(formatOutgoing(attacker.moves[0].name, them.speciesForme, outcome)).toContain(them.speciesForme);
  });
});
