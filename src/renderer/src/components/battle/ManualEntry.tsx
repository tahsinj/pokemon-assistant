/**
 * Typing in a battle played somewhere else: teams first, then one event at a
 * time. The page turns the events into protocol lines (engine/manualLog.ts)
 * and shows them like any replay.
 */
import { useState } from 'react';
import { SectionHead } from '../hud/ModuleFrame';
import { Segmented } from '../hud/Segmented';
import {
  eventProblem,
  manualActives,
  setupProblems,
  speciesName,
  type ManualEvent,
  type ManualSetup,
} from '../../engine/manualLog';
import type { SideId } from '../../engine/types';

const button = 'chunky font-display text-[12px]';
const pad = { padding: '6px 14px' };

const splitTeam = (text: string) =>
  text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export function ManualSetupForm({ onStart, onCancel }: { onStart: (setup: ManualSetup) => void; onCancel: () => void }) {
  const [names, setNames] = useState({ p1: 'You', p2: 'Opponent' });
  const [teams, setTeams] = useState({ p1: '', p2: '' });
  const [problems, setProblems] = useState<string[]>([]);

  const start = () => {
    const setup: ManualSetup = { format: '[Gen 9] OU', names, teams: { p1: splitTeam(teams.p1), p2: splitTeam(teams.p2) } };
    const found = setupProblems(setup);
    setProblems(found);
    if (!found.length) onStart(setup);
  };

  return (
    <div data-ui="manual-setup" className="flex flex-col gap-3 hud-form">
      <p className="font-sans text-[14px] text-ink-2 m-0">
        Name both sides and list each team, lead first, separated by commas or lines. Moves, damage and switches come next.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(['p1', 'p2'] as const).map((side) => (
          <div key={side} className="flex flex-col gap-2">
            <input
              value={names[side]}
              onChange={(e) => setNames({ ...names, [side]: e.target.value })}
              aria-label={side === 'p1' ? 'Your name' : 'Opponent name'}
            />
            <textarea
              value={teams[side]}
              onChange={(e) => setTeams({ ...teams, [side]: e.target.value })}
              aria-label={side === 'p1' ? 'Your team' : 'Opponent team'}
              placeholder={side === 'p1' ? 'Garchomp, Corviknight, ...' : 'Rotom-Wash, Gholdengo, ...'}
              rows={4}
            />
          </div>
        ))}
      </div>
      {problems.map((p) => (
        <p key={p} role="alert" className="font-sans text-[14px] text-danger m-0">
          {p}
        </p>
      ))}
      <div className="flex gap-2">
        <button type="button" className={button} style={pad} onClick={start}>
          START ENTRY
        </button>
        <button type="button" className={`${button} ghost`} style={pad} onClick={onCancel}>
          CANCEL
        </button>
      </div>
    </div>
  );
}

type Kind = 'move' | 'switch' | 'hp' | 'status';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'move', label: 'Move' },
  { id: 'switch', label: 'Switch' },
  { id: 'hp', label: 'Other HP change' },
  { id: 'status', label: 'Status' },
];

const STATUSES = [
  { id: 'brn', label: 'Burn' },
  { id: 'par', label: 'Paralysis' },
  { id: 'psn', label: 'Poison' },
  { id: 'tox', label: 'Toxic' },
  { id: 'slp', label: 'Sleep' },
  { id: 'frz', label: 'Freeze' },
] as const;

export function ManualComposer({
  setup,
  events,
  onChange,
}: {
  setup: ManualSetup;
  events: ManualEvent[];
  onChange: (events: ManualEvent[]) => void;
}) {
  const [side, setSide] = useState<SideId>('p1');
  const [kind, setKind] = useState<Kind>('move');
  const [move, setMove] = useState('');
  const [hp, setHp] = useState('');
  const [species, setSpecies] = useState('');
  const [from, setFrom] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]['id']>('brn');
  const [problem, setProblem] = useState<string | null>(null);
  const actives = manualActives(setup, events);
  const other: SideId = side === 'p1' ? 'p2' : 'p1';

  const add = (e: ManualEvent) => {
    const why = eventProblem(setup, events, e);
    setProblem(why);
    if (why) return;
    onChange([...events, e]);
    setMove('');
    setHp('');
    setFrom('');
  };

  const hpValue = hp.trim() === '' ? undefined : Number(hp);
  const submit = () => {
    if (hpValue != null && !(hpValue >= 0 && hpValue <= 100)) return setProblem('HP is a percentage from 0 to 100.');
    if (kind === 'move') add({ kind, side, move, hpAfter: hpValue });
    if (kind === 'switch') add({ kind, side, species: species || setup.teams[side].find((s) => speciesName(s) !== actives[side]) || '' });
    if (kind === 'hp') {
      if (hpValue == null) return setProblem('Give the HP it was left at.');
      add({ kind, side, hpAfter: hpValue, from: from.trim() || undefined });
    }
    if (kind === 'status') add({ kind, side, status });
  };

  return (
    <div data-ui="manual-entry" className="mono-panel rounded-[12px] p-3 flex flex-col gap-2 hud-form">
      <SectionHead label="Enter" extra={`${actives[side]} is in for ${setup.names[side]}`} />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={side} onChange={setSide} options={[{ id: 'p1', label: setup.names.p1 }, { id: 'p2', label: setup.names.p2 }]} />
        <Segmented value={kind} onChange={setKind} options={KINDS} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {kind === 'move' && (
          <>
            <input value={move} onChange={(e) => setMove(e.target.value)} placeholder="Move" aria-label="Move" className="min-w-[160px]" />
            <input
              value={hp}
              onChange={(e) => setHp(e.target.value)}
              placeholder={`${actives[other]} HP % after`}
              aria-label="Target HP after"
              inputMode="numeric"
              className="w-[200px]"
            />
          </>
        )}
        {kind === 'switch' && (
          <select value={species} onChange={(e) => setSpecies(e.target.value)} aria-label="Switch to">
            <option value="">Choose a Pokémon</option>
            {setup.teams[side].map((s) => (
              <option key={s} value={s}>
                {speciesName(s) ?? s}
              </option>
            ))}
          </select>
        )}
        {kind === 'hp' && (
          <>
            <input value={hp} onChange={(e) => setHp(e.target.value)} placeholder="HP % after" aria-label="HP after" inputMode="numeric" className="w-[140px]" />
            <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Cause (Stealth Rock, Leftovers)" aria-label="Cause" className="min-w-[220px]" />
          </>
        )}
        {kind === 'status' && (
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <button type="button" className={button} style={pad} onClick={submit}>
          ADD
        </button>
      </div>
      {problem && (
        <p role="alert" className="font-sans text-[14px] text-danger m-0">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} style={pad} onClick={() => add({ kind: 'endTurn' })}>
          END TURN
        </button>
        <button type="button" className={`${button} ghost`} style={pad} onClick={() => onChange(events.slice(0, -1))} disabled={!events.length}>
          UNDO
        </button>
      </div>
    </div>
  );
}
