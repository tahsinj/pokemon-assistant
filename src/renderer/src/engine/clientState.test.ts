import { describe, expect, it } from 'vitest';
import { Engine, playOut, seedFrom } from './engine';
import { greedyBot } from './bots/greedy';
import { clientBattle } from './clientState';
import { trackSets } from './setTracker';
import { engineContext } from './bots/setPool';

// Aegislash and the Megas are not in Gen 9's own dex, only National Dex. A
// team can also start with a Mega form, as simulations and some formats do.
const p1 = `Aegislash @ Leftovers
Ability: Stance Change
EVs: 252 HP / 4 Atk / 252 SpD
Sassy Nature
- King's Shield
- Shadow Sneak
- Shadow Ball
- Toxic

Charizard @ Charizardite X
Ability: Blaze
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Dragon Dance
- Flare Blitz
- Dragon Claw
- Earthquake`;

const p2 = `Charizard-Mega-Y @ Charizardite Y
Ability: Drought
EVs: 252 SpA / 4 SpD / 252 Spe
Timid Nature
- Fire Blast
- Solar Beam
- Focus Blast
- Roost

Tyranitar @ Tyranitarite
Ability: Sand Stream
EVs: 252 Atk / 4 SpD / 252 Spe
Jolly Nature
- Stone Edge
- Crunch
- Earthquake
- Dragon Dance

Zapdos @ Heavy-Duty Boots
Ability: Pressure
EVs: 252 HP / 252 Def / 4 SpA
Bold Nature
- Discharge
- Roost
- Hurricane
- U-turn`;

describe('client state for National Dex', () => {
  it('reads a Mega that starts the battle and uses Roost', () => {
    // Roost makes the client look up the user's types, which failed for Megas.
    const lines = [
      '|player|p1|A|',
      '|player|p2|B|',
      '|gen|9',
      '|start',
      '|switch|p1a: Charizard|Charizard-Mega-Y, L100|100/100',
      '|switch|p2a: Kingambit|Kingambit, L100|100/100',
      '|turn|1',
      '|move|p1a: Charizard|Roost|p1a: Charizard',
      '|-singleturn|p1a: Charizard|move: Roost',
      '|turn|2',
    ];
    const battle = clientBattle(lines);
    expect(battle.p1.active[0]?.types).toEqual(['Fire', 'Flying']);
  });

  it('follows battles with Pokémon, Megas and items Gen 9 marks as past', () => {
    const engine = Engine.start({ format: 'gen9nationaldex', seed: seedFrom(3), p1: { name: 'A', team: p1 }, p2: { name: 'B', team: p2 } });
    playOut(engine, (side, req) => greedyBot.choose(engine, side, req));
    expect(engine.ended).toBe(true);
    const battle = clientBattle(engine.linesFor('spectator'));
    expect(battle.p1.team.map((p) => p.baseSpeciesForme)).toContain('Aegislash');
    // The client counts PP for the viewer's own moves, which looks up the foe's species.
    for (const side of ['p1', 'p2'] as const) {
      expect(() => trackSets(engine.linesFor(side), side, engineContext(), engine.battle[side].pokemon.map((p) => p.set))).not.toThrow();
    }
  });
});
