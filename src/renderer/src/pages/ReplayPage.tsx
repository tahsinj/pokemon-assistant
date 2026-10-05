/**
 * Replay review: load a Showdown replay (link, saved page or log file), step
 * through it turn by turn, and review one side's move choices.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Pokemon } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { buildSmogonSetPool } from '../lib/battle/predictor/smogonPriors';
import { engineContext } from '../engine/bots/setPool';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { Segmented } from '../components/hud/Segmented';
import { ActiveCard, BattleLog, EvalGraph } from '../components/battle/BattleParts';
import { clientBattle } from '../engine/clientState';
import { linesUpTo, parseReplay, replayJsonUrl, type Replay } from '../engine/replay';
import { replayEvals, reviewReplay, searchReviewTurn, type Flag } from '../engine/review';
import type { SideId } from '../engine/types';

type ReviewMode = 'quick' | 'search';

export function ReplayPage({ pokemon, smogon }: { pokemon: Pokemon[]; smogon: SmogonBundle | null }) {
  const [replay, setReplay] = useState<Replay | null>(null);
  const [link, setLink] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turn, setTurn] = useState(0);
  const [side, setSide] = useState<SideId>('p1');
  const [mode, setMode] = useState<ReviewMode>('quick');
  const [searched, setSearched] = useState<{ flags: Flag[]; done: number }>({ flags: [], done: 0 });
  const ctx = useMemo(
    () => engineContext(smogon ? buildSmogonSetPool(smogon, Object.fromEntries(pokemon.map((p) => [p.id, p]))) : undefined),
    [smogon, pokemon],
  );

  const open = (text: string) => {
    try {
      const r = parseReplay(text);
      setReplay(r);
      setTurn(0);
      setSide('p1');
      setProblem(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That file could not be read.');
    }
  };

  const fetchLink = async () => {
    const url = replayJsonUrl(link);
    if (!url) {
      setProblem('That does not look like a replay link, e.g. https://replay.pokemonshowdown.com/gen9ou-123456.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`The replay server answered ${res.status}.`);
      open(await res.text());
    } catch (e) {
      setProblem(`${e instanceof Error ? e.message : 'Could not download the replay.'} You can also save the replay page and open the file.`);
    } finally {
      setLoading(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (file) open(await file.text());
  };

  const total = replay?.turnStarts.length ?? 0;
  const shown = useMemo(() => (replay ? linesUpTo(replay, turn >= total ? total + 1 : turn) : []), [replay, turn, total]);
  const battle = useMemo(() => clientBattle(shown), [shown]);
  const quickFlags = useMemo(() => (replay ? reviewReplay(replay, side) : []), [replay, side]);

  // The search review takes a search per turn, so it runs a turn at a time and lets the page paint between.
  useEffect(() => {
    if (mode !== 'search' || !replay) return;
    let cancelled = false;
    setSearched({ flags: [], done: 0 });
    void (async () => {
      const found: Flag[] = [];
      for (let t = 1; t <= replay.turnStarts.length; t++) {
        await new Promise((r) => setTimeout(r, 0));
        if (cancelled) return;
        const flag = searchReviewTurn(replay, t, side, ctx);
        if (flag) found.push(flag);
        setSearched({ flags: [...found], done: t });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, replay, side, ctx]);

  const flags = mode === 'quick' ? quickFlags : searched.flags;
  const searching = mode === 'search' && searched.done < total;
  const evals = useMemo(() => (replay ? replayEvals(replay, side) : []), [replay, side]);

  const loader = (
    <div className="flex flex-wrap items-center gap-2 hud-form">
      <input
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://replay.pokemonshowdown.com/gen9ou-..."
        aria-label="Replay link"
        className="min-w-[280px] flex-1"
        onKeyDown={(e) => e.key === 'Enter' && void fetchLink()}
      />
      <button type="button" className="chunky font-display text-[12px]" style={{ padding: '6px 14px' }} onClick={() => void fetchLink()} disabled={loading}>
        {loading ? 'LOADING…' : 'LOAD LINK'}
      </button>
      <label className="chunky ghost font-display text-[12px] cursor-pointer" style={{ padding: '6px 14px' }}>
        OPEN FILE
        <input
          type="file"
          accept=".json,.html,.htm,.log,.txt"
          aria-label="Open a saved replay or battle log"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>
    </div>
  );

  if (!replay) {
    return (
      <ModuleFrame subtitle="Step through a Showdown battle and review one side's choices">
        <div className="flex flex-col gap-3">
          {loader}
          <p className="text-[13px] text-ink-2 m-0">
            Paste a replay link, or open a saved replay page, its JSON, or a log saved from Practice.
          </p>
          {problem && (
            <p role="alert" className="text-[14px] text-danger m-0">
              {problem}
            </p>
          )}
        </div>
      </ModuleFrame>
    );
  }

  const names = replay.players;
  const reviewed = names[side];
  const other: SideId = side === 'p1' ? 'p2' : 'p1';

  return (
    <ModuleFrame
      subtitle={`${names.p1} vs ${names.p2}${replay.format ? ` · ${replay.format}` : ''} · ${total} turns`}
      side={
        <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 12px' }} onClick={() => setReplay(null)}>
          ANOTHER REPLAY
        </button>
      }
    >
      <div data-ui="replay" className="grid grid-cols-[minmax(0,1fr),minmax(260px,340px)] gap-4">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono-hud text-[14px] uppercase tracking-wider text-ink-2">Review</span>
            <Segmented value={side} onChange={setSide} options={[{ id: 'p1', label: names.p1 }, { id: 'p2', label: names.p2 }]} />
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { id: 'quick', label: 'Quick' },
                { id: 'search', label: 'Search' },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '4px 10px' }} onClick={() => setTurn(0)} disabled={turn === 0} aria-label="First turn">
              FIRST
            </button>
            <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '4px 10px' }} onClick={() => setTurn((t) => Math.max(0, t - 1))} disabled={turn === 0} aria-label="Previous turn">
              PREV
            </button>
            <span data-ui="turn" className="font-mono-hud text-[15px] text-ink-0 min-w-[110px] text-center">
              {turn === 0 ? 'Team preview' : turn > total ? 'End' : `Turn ${turn} of ${total}`}
            </span>
            <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '4px 10px' }} onClick={() => setTurn((t) => Math.min(total + 1, t + 1))} disabled={turn > total} aria-label="Next turn">
              NEXT
            </button>
            <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '4px 10px' }} onClick={() => setTurn(total + 1)} disabled={turn > total} aria-label="Last turn">
              LAST
            </button>
            <input
              type="range"
              min={0}
              max={total + 1}
              value={turn}
              onChange={(e) => setTurn(Number(e.target.value))}
              aria-label="Turn"
              className="flex-1 min-w-[120px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ActiveCard battle={battle} side={other} label={names[other]} exactHp={false} />
            <ActiveCard battle={battle} side={side} label={names[side]} exactHp={false} />
          </div>
          <div data-ui="review" className="mono-panel rounded-[12px] p-3 flex flex-col gap-2">
            <SectionHead
              label="Review"
              extra={
                searching
                  ? `checking turn ${searched.done + 1} of ${total}, ${flags.length} found so far`
                  : flags.length
                    ? `${flags.length} ${flags.length === 1 ? 'turn' : 'turns'} to look at for ${reviewed}`
                    : `nothing stands out for ${reviewed}`
              }
            />
            {flags.map((f) => (
              <button
                key={f.turn}
                type="button"
                onClick={() => setTurn(f.turn)}
                className="text-left rounded-[10px] border border-white/10 bg-white/[.03] hover:border-accent-2 px-3 py-2 transition"
              >
                <span className="font-mono-hud text-[14px] text-accent-2 mr-2">Turn {f.turn}</span>
                <span className="font-sans text-[13px] text-ink-1">{f.text}</span>
              </button>
            ))}
            <p className="font-sans text-[13px] text-ink-2 m-0">
              {mode === 'quick'
                ? 'Compares each move with the other moves that Pokémon revealed during the battle, against the target at the start of the turn. Unrevealed moves and sets are not known.'
                : 'Rebuilds each turn in the simulator from what the replay showed, fills in unrevealed sets with likely ones, and ranks every option with the Search bot. Volatile effects such as Substitute are not carried over.'}
            </p>
          </div>
        </div>
        <div className="mono-panel rounded-[12px] p-3 flex flex-col min-h-0 max-h-[520px]">
          {evals.length > 1 && <EvalGraph evals={evals} ahead={`${reviewed} is`} behind={`${names[other]} is`} />}
          <BattleLog lines={shown} names={names} />
        </div>
      </div>
    </ModuleFrame>
  );
}
