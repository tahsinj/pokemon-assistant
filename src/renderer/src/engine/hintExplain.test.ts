import { describe, expect, it } from 'vitest';
import { PracticeSession } from './session';
import { Engine, seedFrom } from './engine';
import { explainHint } from './hintExplain';
import { trackSets } from './setTracker';
import { engineContext } from './bots/setPool';

const mine = `Corviknight @ Leftovers
Ability: Pressure
EVs: 252 HP / 4 Atk / 252 Def
Impish Nature
- Brave Bird
- Roost
- U-turn
- Body Press

Iron Valiant @ Booster Energy
Ability: Quark Drive
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Moonblast
- Shadow Ball
- Psyshock
- Vacuum Wave`;

// Draco Meteor is in none of Garchomp's random battle sets, so only a peek at the real set could name it.
const theirs = `Garchomp @ Choice Specs
Ability: Rough Skin
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Draco Meteor
- Earthquake
- Fire Blast
- Stone Edge`;

describe('hint explanations', () => {
  it('explain each hint from your view of the battle', () => {
    const s = new PracticeSession({ format: 'gen9ou', botLevel: 1, seed: 3, playerTeam: mine, botTeam: theirs });
    s.choose('team 1');
    const hints = s.hint();
    expect(hints.length).toBeGreaterThan(0);
    const move = hints.find((h) => !h.choice.startsWith('switch'))!;
    expect(move.explanation?.outgoing).toContain('Garchomp');
    expect(move.explanation?.speed).toMatch(/Garchomp/);
    expect(move.explanation?.assumptions[0]).toMatch(/opponent hypothesis/);
    for (const h of hints) {
      expect(h.explanation, h.label).not.toBeNull();
      expect(h.explanation?.incoming ?? '').not.toContain('Draco Meteor');
    }
  }, 60_000);

  it('explain a switch in a random battle, where your bench is only known from your sets', () => {
    const engine = Engine.start({ format: 'gen9randombattle', seed: seedFrom(8), p1: { name: 'A' }, p2: { name: 'B' } });
    const view = trackSets(engine.linesFor('p1'), 'p1', engineContext(), engine.battle.p1.pokemon.map((p) => p.set));
    const req = engine.request('p1')!;
    const bench = req.side.pokemon[1].details.split(',')[0];
    const why = explainHint(view, 'p1', req, 'switch 2');
    expect(why?.exchange).toContain(bench);
    expect(why?.incoming ?? '').toContain(bench);
  });
});
