/**
 * Practice battles against a bot on the real Showdown simulator. Setup picks
 * both teams and the bot; the battle view renders from the protocol lines the
 * player has seen, and choices come from the simulator's own request.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { useFormat } from '../lib/formats';
import { findMove } from '../lib/displayNames';
import { getTeamDraft } from '../lib/teamDraft';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { Segmented } from '../components/hud/Segmented';
import { TypeChip } from '../components/hud/HudPrimitives';
import { hpColorFor } from '../lib/battle/koText';
import { BOT_NAMES, type BotLevel, type Hint, type SessionOptions, type SessionView } from '../engine/session';
import { createPracticeClient, type PracticeClient } from '../engine/practiceClient';
import { clientBattle } from '../engine/clientState';
import { ActiveCard, BattleLog, EvalGraph } from '../components/battle/BattleParts';
import { sampleMetaTeam } from '../engine/metaTeam';
import { membersToShowdown } from '../engine/teamText';
import { validateTeam } from '../engine/engine';
import { takePracticeHandoff } from '../engine/handoff';
import { isFainted, type BattleRequest, type RequestPokemon } from '../engine/types';

type MySource = 'saved' | 'draft' | 'paste' | 'meta' | 'random';
type FoeSource = 'meta' | 'saved' | 'random';

const MY_SOURCES: { id: MySource; label: string }[] = [
  { id: 'saved', label: 'Saved team' },
  { id: 'draft', label: 'Team Builder' },
  { id: 'paste', label: 'Paste' },
  { id: 'meta', label: 'Meta team' },
  { id: 'random', label: 'Random' },
];

const FOE_SOURCES: { id: FoeSource; label: string }[] = [
  { id: 'meta', label: 'Meta team' },
  { id: 'saved', label: 'Saved team' },
  { id: 'random', label: 'Random' },
];

const LEVELS: { id: string; label: string }[] = (Object.keys(BOT_NAMES) as unknown as BotLevel[]).map((l) => ({
  id: String(l),
  label: `${l} · ${BOT_NAMES[l]}`,
}));

export function PracticePage({
  pokemon,
  moves,
  smogon,
}: {
  pokemon: Pokemon[];
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
}) {
  const format = useFormat();
  const bridge = typeof window !== 'undefined' ? window.assistant : undefined;
  const [savedTeams, setSavedTeams] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [mySource, setMySource] = useState<MySource>('random');
  const [myTeamId, setMyTeamId] = useState('');
  const [paste, setPaste] = useState('');
  const [foeSource, setFoeSource] = useState<FoeSource>(smogon ? 'meta' : 'random');
  const [foeTeamId, setFoeTeamId] = useState('');
  const [level, setLevel] = useState<BotLevel>(1);
  const [view, setView] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastOptions, setLastOptions] = useState<SessionOptions | null>(null);
  const [hints, setHints] = useState<Hint[] | null>(null);
  const client = useRef<PracticeClient | null>(null);

  useEffect(() => () => client.current?.dispose(), []);

  // Teams sent from the damage calc start a battle right away.
  useEffect(() => {
    const handoff = takePracticeHandoff();
    if (handoff) void run({ format: format.showdownFormat, ...handoff, botLevel: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!bridge?.teamsList) return;
    bridge
      .teamsList()
      .then((rows) => {
        setSavedTeams(rows);
        if (!rows.length) return;
        const newest = rows.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
        setMyTeamId(newest.id);
        setFoeTeamId(newest.id);
        setMySource('saved');
      })
      .catch(() => setSavedTeams([]));
  }, [bridge]);

  const pokemonById = useMemo(() => new Map(pokemon.map((p) => [p.id, p])), [pokemon]);

  const savedText = async (id: string): Promise<string> => {
    const rec = id && bridge?.teamsLoad ? await bridge.teamsLoad(id) : null;
    if (!rec) throw new Error('Pick a saved team.');
    return membersToShowdown(rec.members, moves);
  };

  const myTeam = async (): Promise<string> => {
    switch (mySource) {
      case 'saved':
        return savedText(myTeamId);
      case 'draft': {
        const members = getTeamDraft().flatMap((d, slot) => {
          const p = d && pokemonById.get(d.speciesId);
          return p ? [{ slot, speciesId: p.id, speciesDisplay: p.name, item: null, ability: null, nature: null, level: null, ivs: null, evs: null, moves: null, ...d.detail }] : [];
        });
        if (!members.length) throw new Error('The Team Builder has no team in progress.');
        return membersToShowdown(members, moves);
      }
      case 'paste':
        if (!paste.trim()) throw new Error('Paste a Showdown team first.');
        return paste;
      case 'meta':
        if (!smogon) throw new Error('No usage data for this format.');
        return sampleMetaTeam(smogon, pokemon);
      default:
        return '';
    }
  };

  const foeTeam = async (): Promise<string> => {
    if (foeSource === 'saved') return savedText(foeTeamId);
    if (foeSource === 'meta') {
      if (!smogon) throw new Error('No usage data for this format.');
      return sampleMetaTeam(smogon, pokemon);
    }
    return '';
  };

  const run = async (options: SessionOptions) => {
    setBusy(true);
    setProblem(null);
    try {
      client.current?.dispose();
      client.current = createPracticeClient();
      setView(await client.current.start(options));
      setLastOptions(options);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The battle could not start.');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    try {
      const [mine, theirs] = await Promise.all([myTeam(), foeTeam()]);
      const battleFormat = !mine && !theirs ? 'gen9randombattle' : format.showdownFormat;
      setWarnings(mine && battleFormat !== 'gen9randombattle' ? validateTeam(battleFormat, mine) : []);
      await run({ format: battleFormat, playerTeam: mine, botTeam: theirs, botLevel: level });
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The battle could not start.');
    }
  };

  const act = async (fn: (c: PracticeClient) => Promise<SessionView>) => {
    if (!client.current || busy) return;
    setBusy(true);
    setHints(null);
    try {
      setView(await fn(client.current));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const askHint = async () => {
    if (!client.current || busy) return;
    setBusy(true);
    try {
      setHints(await client.current.hint());
    } finally {
      setBusy(false);
    }
  };

  const exportLog = async () => {
    if (!client.current) return;
    const text = await client.current.exportLog();
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `stablab-practice-${Date.now()}.log` });
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!view) {
    return (
      <ModuleFrame subtitle={`Play ${format.label} against a bot on the Showdown simulator`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 hud-form">
          <div className="mono-panel p-4 rounded-[12px] flex flex-col gap-3">
            <SectionHead label="Your team" />
            <Segmented value={mySource} onChange={setMySource} options={MY_SOURCES.filter((s) => s.id !== 'saved' || savedTeams.length)} />
            {mySource === 'saved' && (
              <TeamSelect teams={savedTeams} value={myTeamId} onChange={setMyTeamId} label="Your saved team" />
            )}
            {mySource === 'paste' && (
              <textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={8}
                aria-label="Your team as a Showdown paste"
                placeholder={'Garchomp @ Rocky Helmet\nAbility: Rough Skin\n- Earthquake\n...'}
              />
            )}
            <p className="text-[13px] text-ink-2 m-0">{SOURCE_HINT[mySource]}</p>
          </div>
          <div className="mono-panel p-4 rounded-[12px] flex flex-col gap-3">
            <SectionHead label="Opponent" />
            <Segmented value={foeSource} onChange={setFoeSource} options={FOE_SOURCES.filter((s) => s.id !== 'saved' || savedTeams.length)} />
            {foeSource === 'saved' && (
              <TeamSelect teams={savedTeams} value={foeTeamId} onChange={setFoeTeamId} label="Opponent's saved team" />
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono-hud text-[14px] uppercase tracking-wider text-ink-2">Bot</span>
              <Segmented value={String(level)} onChange={(v) => setLevel(Number(v) as BotLevel)} options={LEVELS} />
            </div>
            <p className="text-[13px] text-ink-2 m-0">{BOT_HINT[level]}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            className="chunky font-display text-[13px]"
            style={{ '--c': 'var(--hud-accent-2)', padding: '8px 18px' } as React.CSSProperties}
            onClick={() => void start()}
            disabled={busy}
          >
            {busy ? 'STARTING…' : 'START BATTLE'}
          </button>
          {problem && (
            <span role="alert" className="text-[14px] text-danger">
              {problem}
            </span>
          )}
        </div>
      </ModuleFrame>
    );
  }

  return (
    <BattleView
      view={view}
      busy={busy}
      warnings={warnings}
      problem={problem}
      moves={moves}
      hints={hints}
      onHint={() => void askHint()}
      onChoose={(c) => void act((cl) => cl.choose(c))}
      onUndo={() => void act((cl) => cl.undo())}
      onExport={() => void exportLog()}
      onRematch={() => {
        setHints(null);
        if (lastOptions) void run({ ...lastOptions, seed: undefined });
      }}
      onNew={() => {
        client.current?.dispose();
        client.current = null;
        setView(null);
        setProblem(null);
      }}
    />
  );
}

const SOURCE_HINT: Record<MySource, string> = {
  saved: 'Uses the team exactly as saved.',
  draft: 'Uses the team currently open in the Team Builder.',
  paste: 'Any team exported from Showdown.',
  meta: 'Six Pokémon drawn from this format by usage, with common sets.',
  random: 'A random battle team. If both sides are random, the battle uses random battle rules.',
};

const BOT_HINT: Record<BotLevel, string> = {
  0: 'Picks any legal move or switch at random.',
  1: 'Picks the move that does the most damage and switches out of a sure KO.',
  2: 'Plays each option against your likely replies on the simulator and picks the best. Thinks for a moment each turn.',
};

function TeamSelect({
  teams,
  value,
  onChange,
  label,
}: {
  teams: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

const speciesOf = (details: string) => details.split(',')[0];

function hpPercent(condition: string): number {
  const [frac] = condition.split(' ');
  const [cur, max] = frac.split('/').map(Number);
  return max ? Math.round((100 * cur) / max) : 0;
}

function BattleView({
  view,
  busy,
  warnings,
  problem,
  moves,
  hints,
  onHint,
  onChoose,
  onUndo,
  onExport,
  onRematch,
  onNew,
}: {
  view: SessionView;
  busy: boolean;
  warnings: string[];
  problem: string | null;
  moves: Record<string, Move>;
  hints: Hint[] | null;
  onHint: () => void;
  onChoose: (choice: string) => void;
  onUndo: () => void;
  onExport: () => void;
  onRematch: () => void;
  onNew: () => void;
}) {
  const battle = useMemo(() => clientBattle(view.lines), [view.lines]);

  const resultText = view.result === 'player' ? 'You won!' : view.result === 'bot' ? `${view.botName} won.` : 'Tie.';

  return (
    <ModuleFrame
      subtitle={`${view.ended ? 'Battle over' : view.turn ? `Turn ${view.turn}` : 'Team preview'} · vs ${view.botName}`}
      side={
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chunky ghost font-display text-[12px]"
            style={{ padding: '6px 12px' }}
            onClick={onHint}
            disabled={busy || view.ended || !view.request?.active || !!view.request.forceSwitch}
            title="Ask the Search bot for its three best options"
          >
            HINT
          </button>
          <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 12px' }} onClick={onUndo} disabled={!view.canUndo || busy}>
            TAKE BACK
          </button>
          <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 12px' }} onClick={onExport}>
            SAVE LOG
          </button>
          <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 12px' }} onClick={onNew}>
            NEW BATTLE
          </button>
        </div>
      }
    >
      <div data-ui="practice-battle" className="grid grid-cols-[minmax(0,1fr),minmax(260px,340px)] gap-4">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <ActiveCard battle={battle} side="p2" label={view.botName} />
            <ActiveCard battle={battle} side="p1" label="You" />
          </div>
          {warnings.length > 0 && (
            <div className="text-[13px] text-ink-2 rounded-[10px] border border-white/10 px-3 py-2">
              Not legal in this format: {warnings.slice(0, 3).join(' ')}
              {warnings.length > 3 ? ` (and ${warnings.length - 3} more)` : ''}
            </div>
          )}
          {hints && !view.ended && <HintList hints={hints} busy={busy} onChoose={onChoose} />}
          {view.ended ? (
            <div className="mono-panel rounded-[12px] p-4 flex items-center gap-3 flex-wrap">
              <span data-ui="battle-result" className="font-display text-[20px] font-bold text-ink-0 mr-auto">
                {resultText}
              </span>
              <button type="button" className="chunky font-display text-[12px]" style={{ '--c': 'var(--hud-accent-2)', padding: '6px 14px' } as React.CSSProperties} onClick={onRematch}>
                REMATCH
              </button>
              <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 14px' }} onClick={onNew}>
                NEW BATTLE
              </button>
            </div>
          ) : (
            <Controls request={view.request} busy={busy} moves={moves} onChoose={onChoose} />
          )}
          {(view.error || problem) && (
            <div role="alert" className="text-[14px] text-danger">
              {view.error ?? problem}
            </div>
          )}
        </div>
        <div className="mono-panel rounded-[12px] p-3 flex flex-col min-h-0 max-h-[460px]">
          {view.evals.length > 1 && <EvalGraph evals={view.evals} />}
          <BattleLog lines={view.lines} names={{ p1: 'You', p2: view.botName }} />
        </div>
      </div>
    </ModuleFrame>
  );
}

function Controls({
  request,
  busy,
  moves,
  onChoose,
}: {
  request: BattleRequest | null;
  busy: boolean;
  moves: Record<string, Move>;
  onChoose: (choice: string) => void;
}) {
  const [tera, setTera] = useState(false);
  if (!request || request.wait) {
    return (
      <div className="mono-panel rounded-[12px] p-4">
        <span className="font-sans text-[14px] text-ink-2">Waiting for the opponent…</span>
      </div>
    );
  }
  const team = request.side.pokemon;
  const bench = team.map((p, i) => ({ p, slot: i + 1 })).filter(({ p }) => !p.active);

  if (request.teamPreview) {
    return (
      <div data-ui="battle-controls" className="mono-panel rounded-[12px] p-4 flex flex-col gap-2">
        <SectionHead label="Pick your lead" />
        <div className="flex flex-wrap gap-2">
          {team.map((p, i) => (
            <ChoiceButton key={p.ident} disabled={busy} onClick={() => onChoose(`team ${i + 1}`)} title={`Lead with ${speciesOf(p.details)}`}>
              {speciesOf(p.details)}
            </ChoiceButton>
          ))}
        </div>
      </div>
    );
  }

  const active = request.active?.[0];
  const forced = !!request.forceSwitch?.[0];
  const trapped = !!(active?.trapped || active?.maybeTrapped);
  return (
    <div data-ui="battle-controls" className="mono-panel rounded-[12px] p-4 flex flex-col gap-3">
      {!forced && active && (
        <>
          <div className="flex items-center justify-between gap-2">
            <SectionHead label="Moves" />
            {active.canTerastallize && (
              <label className="flex items-center gap-2 text-[13px] text-ink-1 cursor-pointer">
                <input type="checkbox" checked={tera} onChange={(e) => setTera(e.target.checked)} />
                Terastallize ({active.canTerastallize})
              </label>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {active.moves.map((m, i) => {
              const mv = findMove(m.id, moves);
              const out = !!m.disabled || m.pp === 0;
              return (
                <ChoiceButton
                  key={`${m.id}-${i}`}
                  disabled={busy || out}
                  onClick={() => onChoose(`move ${i + 1}${tera && active.canTerastallize ? ' terastallize' : ''}`)}
                  title={mv?.desc ?? m.move}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {mv && <TypeChip t={mv.type.toLowerCase()} />}
                    <span className="truncate">{m.move}</span>
                  </span>
                  {m.maxpp ? <span className="font-mono-hud text-[14px] text-ink-2 ml-auto pl-2">{m.pp}/{m.maxpp}</span> : null}
                </ChoiceButton>
              );
            })}
          </div>
        </>
      )}
      <SectionHead label={forced ? 'Choose a replacement' : 'Switch'} extra={!forced && trapped ? 'you are trapped' : undefined} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {bench.map(({ p, slot }) => (
          <SwitchButton key={p.ident} p={p} disabled={busy || isFainted(p) || (!forced && trapped)} onClick={() => onChoose(`switch ${slot}`)} />
        ))}
      </div>
    </div>
  );
}

function ChoiceButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      data-ui="choice"
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex items-center gap-2 min-w-0 rounded-[10px] border border-white/15 bg-white/[.05] px-3 py-2 text-left font-display text-[14px] font-semibold text-ink-0 hover:border-accent-2 disabled:opacity-40 disabled:hover:border-white/15 transition"
    >
      {children}
    </button>
  );
}

function SwitchButton({ p, disabled, onClick }: { p: RequestPokemon; disabled: boolean; onClick: () => void }) {
  const pct = isFainted(p) ? 0 : hpPercent(p.condition);
  return (
    <ChoiceButton disabled={disabled} onClick={onClick} title={`Switch to ${speciesOf(p.details)}`}>
      <span className="flex flex-col min-w-0 flex-1 gap-1">
        <span className="truncate">{speciesOf(p.details)}</span>
        <span className="relative h-[5px] rounded-full bg-black/50 overflow-hidden">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: hpColorFor(pct) }} />
        </span>
      </span>
    </ChoiceButton>
  );
}

function HintList({ hints, busy, onChoose }: { hints: Hint[]; busy: boolean; onChoose: (choice: string) => void }) {
  if (!hints.length) return <div className="text-[13px] text-ink-2">No hint for this decision.</div>;
  const top = hints[0].score;
  return (
    <div data-ui="hints" className="mono-panel rounded-[12px] p-3 flex flex-col gap-2">
      <SectionHead label="Hint" extra="the Search bot's best options; click one to play it" />
      {hints.map((h, i) => (
        <ChoiceButton key={h.choice} disabled={busy} onClick={() => onChoose(h.choice)} title={`Expected value ${h.score.toFixed(2)}`}>
          <span className="font-mono-hud text-[14px] text-accent-2 w-4">{i + 1}</span>
          <span className="truncate">{h.label}</span>
          <span className="font-mono-hud text-[14px] text-ink-2 ml-auto pl-2">
            {i === 0 ? 'best' : `${(h.score - top).toFixed(1)}`}
          </span>
        </ChoiceButton>
      ))}
    </div>
  );
}
