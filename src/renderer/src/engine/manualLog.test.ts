import { describe, expect, it } from 'vitest';
import { clientBattle } from './clientState';
import { eventProblem, manualActives, manualLines, setupProblems, type ManualEvent, type ManualSetup } from './manualLog';
import { parseReplay } from './replay';
import { reviewReplay } from './review';

const setup: ManualSetup = {
  format: '[Gen 9] OU',
  names: { p1: 'Me', p2: 'Them' },
  teams: { p1: ['Garchomp', 'corviknight'], p2: ['Rotom-Wash', 'Gholdengo'] },
};

const events: ManualEvent[] = [
  { kind: 'move', side: 'p1', move: 'earthquake', hpAfter: 100 },
  { kind: 'move', side: 'p2', move: 'Hydro Pump', hpAfter: 45 },
  { kind: 'endTurn' },
  { kind: 'switch', side: 'p2', species: 'Gholdengo' },
  { kind: 'move', side: 'p1', move: 'Dragon Claw', hpAfter: 0 },
  { kind: 'endTurn' },
];

describe('manual entry', () => {
  it('writes protocol lines that read as a replay', () => {
    const lines = manualLines(setup, events);
    const replay = parseReplay(lines.join('\n'));
    expect(replay.players).toEqual({ p1: 'Me', p2: 'Them' });
    expect(replay.turnStarts).toHaveLength(3);
    const battle = clientBattle(replay.lines);
    expect(battle.p1.active[0]?.hp).toBe(45);
    expect(battle.p2.team.find((p) => p.speciesForme === 'Gholdengo')?.fainted).toBe(true);
    expect(battle.p1.active[0]?.moveSlots.map((m) => m.id)).toEqual(['earthquake', 'dragonclaw']);
    expect(Array.isArray(reviewReplay(replay, 'p1'))).toBe(true);
  });

  it('knows who is in and refuses impossible events', () => {
    expect(manualActives(setup, events)).toEqual({ p1: 'Garchomp', p2: 'Gholdengo' });
    expect(eventProblem(setup, events, { kind: 'move', side: 'p2', move: 'Make It Rain' })).toMatch(/fainted/);
    expect(eventProblem(setup, events, { kind: 'switch', side: 'p2', species: 'Rotom-Wash' })).toBeNull();
    expect(eventProblem(setup, events, { kind: 'switch', side: 'p2', species: 'Gholdengo' })).toMatch(/fainted/);
    expect(eventProblem(setup, [], { kind: 'switch', side: 'p1', species: 'Kingambit' })).toMatch(/not on/);
    expect(eventProblem(setup, [], { kind: 'move', side: 'p1', move: 'Flamethrowr' })).toMatch(/not a move/);
    expect(setupProblems({ ...setup, teams: { p1: ['Garchomp', 'Notamon'], p2: [] } })).toHaveLength(2);
  });
});
