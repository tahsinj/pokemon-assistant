import { describe, expect, it } from 'vitest';
import { PracticeSession } from './session';
import { legalChoices } from './bots/random';

const firstLegal = (s: PracticeSession) => {
  const req = s.view().request;
  return req ? legalChoices(req)[0] : 'default';
};

describe('practice session', () => {
  it('plays a full battle against the greedy bot', () => {
    const s = new PracticeSession({ format: 'gen9ou', botLevel: 1, seed: 5 });
    for (let i = 0; i < 1000 && !s.view().ended; i++) {
      const v = s.choose(firstLegal(s));
      expect(v.error).toBeUndefined();
    }
    const end = s.view();
    expect(end.ended).toBe(true);
    expect(end.result).toMatch(/player|bot|tie/);
    expect(end.lines.some((l) => l.startsWith('|win|') || l === '|tie')).toBe(true);
    expect(s.exportLog()).toContain('|turn|');
  });

  it('rejects an illegal choice with the simulator message', () => {
    const s = new PracticeSession({ format: 'gen9ou', botLevel: 0, seed: 9 });
    s.choose('default'); // team preview
    const v = s.choose('move 9');
    expect(v.error).toMatch(/move/i);
    expect(v.request).not.toBeNull();
  });

  it('takes back a turn and replays it the same way', () => {
    const s = new PracticeSession({ format: 'gen9ou', botLevel: 1, seed: 21 });
    s.choose('default');
    const atTurn1 = s.view();
    expect(atTurn1.turn).toBe(1);
    expect(atTurn1.canUndo).toBe(false);
    const after = s.choose('move 1');
    expect(after.turn).toBe(2);
    expect(after.canUndo).toBe(true);
    const back = s.undo();
    expect(back.turn).toBe(1);
    expect(back.lines).toEqual(atTurn1.lines);
    expect(s.choose('move 1').lines.filter((l) => !l.startsWith('|t:|'))).toEqual(after.lines.filter((l) => !l.startsWith('|t:|')));
  });
});

describe('practice session hints', () => {
  it('suggests up to three legal actions and records a value per turn', () => {
    const s = new PracticeSession({ format: 'gen9ou', botLevel: 2, seed: 33 });
    s.choose('default');
    const hints = s.hint();
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.length).toBeLessThanOrEqual(3);
    expect(hints[0].label.length).toBeGreaterThan(0);
    const v = s.choose(hints[0].choice);
    expect(v.error).toBeUndefined();
    expect(v.evals.length).toBe(v.turn);
  }, 60_000);
});
