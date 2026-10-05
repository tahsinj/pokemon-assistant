import { describe, expect, it } from 'vitest';
import { Engine, seedFrom } from '../engine';
import { trackSets } from '../setTracker';
import { determinize } from './determinize';
import { seededRandom } from './random';
import { engineContext } from './setPool';

const mine = `Corviknight @ Leftovers
Ability: Pressure
EVs: 252 HP / 4 Atk / 252 Def
Impish Nature
- Brave Bird
- Roost
- U-turn
- Iron Head`;

// Splash and Lagging Tail are in no random battle set, so a sampled world can't have them.
const theirs = `Garchomp @ Lagging Tail
Ability: Rough Skin
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Earthquake
- Splash
- Dragon Claw
- Fire Fang

Gholdengo @ Choice Specs
Ability: Good as Gold
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Make It Rain
- Shadow Ball
- Trick
- Splash`;

function start() {
  const engine = Engine.start({ format: 'gen9ou', seed: seedFrom(4), p1: { name: 'A', team: mine }, p2: { name: 'B', team: theirs } });
  engine.choose('p1', 'team 1');
  engine.choose('p2', 'team 1');
  return engine;
}

const viewOf = (engine: Engine) =>
  trackSets(engine.linesFor('p1'), 'p1', engineContext(), engine.battle.p1.pokemon.map((p) => p.set));

describe('determinize', () => {
  it('replaces what the foe has not shown with sampled sets', () => {
    const engine = start();
    for (let seed = 1; seed <= 20; seed++) {
      const world = engine.clone();
      determinize(world, viewOf(engine), 'p2', seededRandom(seed));
      for (const p of world.battle.p2.pokemon) {
        expect(p.moveSlots.map((m) => m.id)).not.toContain('splash');
        expect(p.item).not.toBe('laggingtail');
        expect(p.moveSlots.length).toBeGreaterThan(0);
        expect(p.hp).toBe(p.maxhp);
      }
    }
    // The real battle is untouched.
    expect(engine.battle.p2.pokemon[0].moveSlots.map((m) => m.id)).toContain('splash');
  });

  it('keeps revealed moves, items and HP share, and the copy still plays', () => {
    const engine = start();
    // Garchomp attacks; Corviknight's Iron Head reveals nothing about Garchomp's item.
    engine.choose('p1', 'move 4');
    engine.choose('p2', 'move 1');
    const real = engine.battle.p2.active[0];
    const share = real.hp / real.maxhp;
    for (let seed = 1; seed <= 10; seed++) {
      const world = engine.clone();
      determinize(world, viewOf(engine), 'p2', seededRandom(seed));
      const p = world.battle.p2.active[0];
      expect(p.moveSlots.map((m) => m.id)).toContain('earthquake');
      expect(Math.abs(p.hp / p.maxhp - share)).toBeLessThan(0.01);
      const copy = world.clone();
      expect(copy.choose('p1', 'move 1')).toBe(true);
      expect(copy.choose('p2', 'move 1')).toBe(true);
      expect(copy.turn).toBe(engine.turn + 1);
    }
  });
});
