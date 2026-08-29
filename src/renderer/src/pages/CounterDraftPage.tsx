import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { TYPES } from '../lib/typechart';
import { draftCounterTeam, evaluateTeam, type DraftResult, type Candidate, type OpponentEntry } from '../lib/counterDraft';
import type { OpponentBulk } from '../lib/opponentSet';
import {
  loadSavedDrafts,
  persistSavedDrafts,
  addDraft,
  removeDraft,
  type SavedDraft,
} from '../lib/savedDrafts';
import { usePcCollection } from '../lib/usePcCollection';
import { ModuleFrame } from '../components/hud/ModuleFrame';
import { SpeciesList } from '../components/SpeciesList';
import { PokemonSprite } from '../components/PokemonSprite';

const VERDICT_CLASS: Record<string, string> = {
  win: 'bg-[var(--hud-accent-2)]/20 border-[var(--hud-accent-2)]/45 text-[#d7fff4]',
  trade: 'bg-[#e9a425]/20 border-[#e9a425]/40 text-[#ffe6b0]',
  lose: 'bg-[var(--hud-danger)]/15 border-[var(--hud-danger)]/40 text-[#ffc9cf]',
};

const BULK_TABS: { id: OpponentBulk; label: string }[] = [
  { id: 'min', label: 'Min' },
  { id: 'maxIv', label: 'Max IV' },
  { id: 'competitive', label: 'Competitive' },
];

interface OppSlot {
  p: Pokemon;
  level: number;
  /** Whether THIS opponent terastallizes (per-mon, not a format-wide switch). */
  tera?: boolean;
  teraType?: string | null;
  /** Whether THIS opponent Dynamaxes (doubles its HP for the matchup math). */
  dynamax?: boolean;
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const TERA_OPTIONS = TYPES.map(cap);

/** Battle-level normalization: null = each mon's own level; a number flattens
 *  BOTH sides to that level (e.g. Lv 50 tournament format). */
const LEVEL_MODES: { label: string; val: number | null; hint: string }[] = [
  { label: 'Actual', val: null, hint: "Each Pokémon at its own level" },
  { label: 'Lv 50', val: 50, hint: 'Tournament - everything normalized to Lv 50' },
  { label: 'Lv 100', val: 100, hint: 'Smogon singles - everything at Lv 100' },
];

export function CounterDraftPage({
  pokemon,
  moves,
  smogon,
}: { pokemon: Pokemon[]; moves: Record<string, Move>; smogon: SmogonBundle | null }) {
  const pc = usePcCollection();
  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const [opponents, setOpponents] = useState<OppSlot[]>([]);
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [bulk, setBulk] = useState<OpponentBulk>('maxIv');
  const [flatLevel, setFlatLevel] = useState<number | null>(null);
  const [mode, setMode] = useState(6); // team size per side (3v3 … 6v6)
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>(() => loadSavedDrafts());
  const [label, setLabel] = useState('');

  // PC mons usable against a given opponent team. In a flat-level format both
  // sides are normalized, so the underlevel gate doesn't apply (every mon is
  // eligible at the flat level); otherwise drop the badly underleveled.
  const candidatesFor = (opps: OppSlot[], flat: number | null): Candidate[] => {
    const maxLevel = flat ?? opps.reduce((m, o) => Math.max(m, o.level), 1);
    const minLevel = maxLevel * 0.6;
    const out: Candidate[] = [];
    for (const rec of pc.mons) {
      const level = flat ?? rec.level;
      if (level < minLevel) continue;
      const p = pokemonById[rec.speciesId];
      if (p) out.push({ rec: flat == null ? rec : { ...rec, level: flat }, p });
    }
    return out;
  };
  const candidates = useMemo<Candidate[]>(
    () => candidatesFor(opponents, flatLevel),
    [pc.mons, pokemonById, opponents, flatLevel],
  );

  // PC mons dropped by the underlevel gate - surfaced so an excluded mon
  // (e.g. a freshly added one) doesn't silently vanish. Flat formats exclude none.
  const minLevelGate = useMemo(
    () => (flatLevel != null ? 0 : Math.ceil(opponents.reduce((m, o) => Math.max(m, o.level), 1) * 0.6)),
    [opponents, flatLevel],
  );
  const excludedUnderleveled = useMemo(
    () =>
      pc.mons
        .filter((rec) => !!pokemonById[rec.speciesId] && rec.level < minLevelGate)
        .map((rec) => `${pokemonById[rec.speciesId].name} (Lv ${rec.level})`),
    [pc.mons, pokemonById, minLevelGate],
  );

  const addOpponent = (p: Pokemon) => {
    if (opponents.length >= mode) return;
    setOpponents((prev) => [...prev, { p, level: 100 }]);
    setPicking(false);
    setResult(null);
  };
  const removeOpponent = (i: number) => {
    setOpponents((prev) => prev.filter((_, idx) => idx !== i));
    setResult(null);
  };
  const setLevel = (i: number, level: number) => {
    setOpponents((prev) => prev.map((o, idx) => (idx === i ? { ...o, level } : o)));
    setResult(null);
  };

  // The opponent's default Tera type - its most-used Smogon tera, else its
  // primary type. (@smogon/calc expects a capitalized type name.)
  const defaultTera = useCallback(
    (p: Pokemon): string =>
      smogon?.species[p.id]?.teraTypes?.[0]?.name || cap(p.types[0] ?? 'Normal'),
    [smogon],
  );

  // All current format knobs in one bag so the change handlers can re-run with
  // the NEW value (React state updates are async within a tick). Tera/Dynamax
  // are per-opponent (see OppSlot), not format-wide.
  type Format = { bulk: OpponentBulk; flat: number | null; size: number };
  const format = (over?: Partial<Format>): Format =>
    ({ bulk, flat: flatLevel, size: mode, ...over });

  const toEntries = (opps: OppSlot[], f: Format): OpponentEntry[] =>
    opps.map((o) => ({
      p: o.p,
      level: f.flat ?? o.level,
      teraType: o.tera ? (o.teraType ?? defaultTera(o.p)) : null,
      dynamax: !!o.dynamax,
    }));

  const runDraftWith = (opps: OppSlot[], f: Format) =>
    setResult(draftCounterTeam(toEntries(opps, f), candidatesFor(opps, f.flat), moves, smogon, f.bulk, undefined, f.size));
  const runDraft = () => runDraftWith(opponents, format());

  // Re-score the EXISTING drafted team (no re-draft) under updated assumptions.
  const rescore = (opps: OppSlot[], f: Format) =>
    setResult((prev) =>
      prev ? { ...prev, ...evaluateTeam(prev.team, toEntries(opps, f), moves, smogon, f.bulk) } : prev,
    );

  // Save the current opponent team (label optional) for later re-analysis.
  const saveCurrent = () => {
    if (opponents.length === 0) return;
    const auto = `${opponents[0].p.name}${opponents.length > 1 ? ` +${opponents.length - 1}` : ''}`;
    const next = addDraft(
      savedDrafts,
      label.trim() || auto,
      opponents.map((o) => ({ speciesId: o.p.id, level: o.level })),
    );
    setSavedDrafts(next);
    persistSavedDrafts(next);
    setLabel('');
  };
  const deleteSaved = (id: string) => {
    const next = removeDraft(savedDrafts, id);
    setSavedDrafts(next);
    persistSavedDrafts(next);
  };
  // Load a saved opponent team and immediately re-draft against the CURRENT PC.
  const reanalyze = (saved: SavedDraft) => {
    const opps: OppSlot[] = saved.opponents
      .map((s) => ({ p: pokemonById[s.speciesId], level: s.level }))
      .filter((o): o is OppSlot => !!o.p)
      .slice(0, mode);
    setOpponents(opps);
    runDraftWith(opps, format());
  };

  // Switching tabs re-scores the SAME drafted team under the new assumption.
  const changeBulk = (next: OpponentBulk) => {
    setBulk(next);
    rescore(opponents, format({ bulk: next }));
  };

  // Changing the battle level re-drafts: the eligible pool and the best answers
  // genuinely differ once levels are flattened (no level-gap advantage).
  const changeFlatLevel = (next: number | null) => {
    setFlatLevel(next);
    if (result) runDraftWith(opponents, format({ flat: next }));
  };

  // Switching format (3v3 … 6v6) caps the opponent team and the drafted answer
  // to that size; trims any extra opponents and re-drafts.
  const changeMode = (next: number) => {
    setMode(next);
    const trimmed = opponents.slice(0, next);
    if (trimmed.length !== opponents.length) setOpponents(trimmed);
    if (result) runDraftWith(trimmed, format({ size: next }));
  };

  // Toggling one opponent's Tera/Dynamax changes the matchups, so re-draft (a
  // Tera mon may need a different answer; Dynamax doubles its HP).
  const toggleTeraFor = (i: number) => {
    const next = opponents.map((o, idx) =>
      idx === i ? { ...o, tera: !o.tera, teraType: o.teraType ?? defaultTera(o.p) } : o,
    );
    setOpponents(next);
    if (result) runDraftWith(next, format());
  };
  const toggleDynamaxFor = (i: number) => {
    const next = opponents.map((o, idx) => (idx === i ? { ...o, dynamax: !o.dynamax } : o));
    setOpponents(next);
    if (result) runDraftWith(next, format());
  };
  // Tweaking one opponent's Tera type re-scores the current team.
  const setTeraTypeFor = (i: number, teraType: string) => {
    const next = opponents.map((o, idx) => (idx === i ? { ...o, teraType } : o));
    setOpponents(next);
    if (result && next[i].tera) rescore(next, format());
  };

  return (
    <ModuleFrame kicker="◢ MATCHUP DRAFT" title="Counter Draft" subtitle="Build a PC answer to their team">
      <div className="glass rounded-[14px] p-3.5 mb-4">
        {/* Format bar - team size + battle level */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-3 border-b border-white/8">
          <div className="flex items-center gap-1.5" title="Battle format - how many Pokémon each side brings">
            <span className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)]">Mode</span>
            <div className="flex gap-1">
              {[3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => changeMode(n)}
                  aria-pressed={mode === n}
                  className={`font-mono-hud text-[12px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition ${
                    mode === n
                      ? 'bg-[var(--hud-accent)] border-transparent text-[#100b06]'
                      : 'border-white/15 text-[var(--ink-1)] hover:border-[var(--hud-accent-2)]'
                  }`}
                >
                  {n}v{n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5" title="Flatten both sides to one level so a level gap doesn't skew the matchup">
            <span className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)]">Level</span>
            <div className="flex gap-1">
              {LEVEL_MODES.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  onClick={() => changeFlatLevel(m.val)}
                  aria-pressed={flatLevel === m.val}
                  title={m.hint}
                  className={`font-mono-hud text-[12px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition ${
                    flatLevel === m.val
                      ? 'bg-[var(--hud-accent)] border-transparent text-[#100b06]'
                      : 'border-white/15 text-[var(--ink-1)] hover:border-[var(--hud-accent-2)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="font-mono-hud text-[11px] text-[var(--ink-2)] leading-snug max-w-[220px]">
            ◢ Tera &amp; Dynamax are per-opponent - toggle them on each mon below.
          </div>
        </div>

        <div className="flex items-center justify-between mb-2.5">
          <div className="font-mono-hud text-[13px] uppercase tracking-[0.2em] text-[var(--hud-accent-2)]">
            Opponent team - species &amp; level
          </div>
          <button
            type="button"
            onClick={runDraft}
            disabled={opponents.length === 0 || candidates.length === 0}
            className="chunky font-display text-[12px]"
            style={{ padding: '8px 16px', opacity: opponents.length === 0 || candidates.length === 0 ? 0.5 : 1 }}
          >
            ⚙ Draft from my PC
          </button>
        </div>

        {!pc.available || candidates.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-[var(--ink-2)] px-1 py-2">
            {pc.loading ? 'Loading PC…' : 'No usable Pokémon in your PC for this matchup.'}
          </div>
        ) : null}

        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {opponents.map((o, i) => (
            <div key={`${o.p.id}-${i}`} className="bg-white/[.03] border border-white/10 rounded-[12px] p-2.5 text-center relative">
              <button
                type="button"
                onClick={() => removeOpponent(i)}
                className="absolute top-1 right-1.5 font-mono-hud text-[13px] text-[var(--ink-2)] hover:text-[var(--hud-danger)]"
                aria-label={`Remove ${o.p.name}`}
              >
                ×
              </button>
              <PokemonSprite dex={o.p.dex} name={o.p.name} size="xs" />
              <div className="font-display text-[13px] font-semibold truncate mt-1">{o.p.name}</div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <span className="font-mono-hud text-[13px] text-[var(--ink-2)]">Lv</span>
                <LevelInput
                  value={flatLevel ?? o.level}
                  disabled={flatLevel != null}
                  title={flatLevel != null ? `Normalized to Lv ${flatLevel} for this format` : undefined}
                  onCommit={(n) => setLevel(i, n)}
                />
              </div>
              <div className="flex items-center justify-center gap-1 mt-1.5">
                <button
                  type="button"
                  onClick={() => toggleTeraFor(i)}
                  aria-pressed={!!o.tera}
                  title={`Whether ${o.p.name} terastallizes (change type)`}
                  className={`font-mono-hud text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition ${
                    o.tera
                      ? 'bg-[var(--hud-accent)] border-transparent text-[#100b06]'
                      : 'border-white/15 text-[var(--ink-2)] hover:border-[var(--hud-accent-2)]'
                  }`}
                >
                  Tera
                </button>
                <button
                  type="button"
                  onClick={() => toggleDynamaxFor(i)}
                  aria-pressed={!!o.dynamax}
                  title={`Whether ${o.p.name} Dynamaxes (doubles its HP for the matchup math)`}
                  className={`font-mono-hud text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition ${
                    o.dynamax
                      ? 'bg-[var(--hud-accent)] border-transparent text-[#100b06]'
                      : 'border-white/15 text-[var(--ink-2)] hover:border-[var(--hud-accent-2)]'
                  }`}
                >
                  Dmax
                </button>
              </div>
              {o.tera && (
                <div className="flex items-center justify-center gap-1 mt-1.5" title="Tera type this opponent terastallizes into">
                  <span className="font-mono-hud text-[12px] text-[var(--hud-accent-2)]">Type</span>
                  <select
                    value={o.teraType ?? defaultTera(o.p)}
                    onChange={(e) => setTeraTypeFor(i, e.target.value)}
                    aria-label={`${o.p.name} Tera type`}
                    className="bg-black/40 border border-white/15 rounded-full px-2 py-0.5 font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-1)] outline-none focus:border-[var(--hud-accent-2)]"
                  >
                    {TERA_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ))}
          {opponents.length < mode && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="border border-dashed border-white/15 rounded-[12px] min-h-[104px] flex flex-col items-center justify-center font-mono-hud text-[15px] text-[var(--ink-2)] hover:border-[var(--hud-accent-2)] hover:text-[var(--ink-1)] transition"
            >
              ＋<br />add mon
            </button>
          )}
        </div>

        {flatLevel != null && (
          <div className="font-mono-hud text-[13px] text-[var(--hud-accent-2)] px-1 mt-2.5">
            ◢ Both sides normalized to Lv {flatLevel} - matchups reflect the format, not a level gap.
          </div>
        )}

        {excludedUnderleveled.length > 0 && (
          <div className="font-mono-hud text-[13px] text-[var(--ink-2)] px-1 mt-2.5 leading-relaxed">
            ⚠ Skipped as underleveled (below Lv {minLevelGate}, ~60% of the top opponent):{' '}
            <span className="text-[var(--ink-1)]">{excludedUnderleveled.join(', ')}</span>. Level them up
            or lower the opponent levels to include them.
          </div>
        )}

        {picking && (
          <div className="mt-3 h-[38vh] min-h-[240px] glass rounded-[12px] p-2">
            <SpeciesList pokemon={pokemon} onSelect={addOpponent} />
          </div>
        )}

        {opponents.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label this matchup…"
              aria-label="Matchup label"
              className="flex-1 bg-black/40 border border-white/15 rounded-full px-3 py-1.5 font-mono-hud text-[13px] text-[var(--ink-0)] outline-none focus:border-[var(--hud-accent-2)]"
            />
            <button
              type="button"
              onClick={saveCurrent}
              className="font-mono-hud text-[12px] uppercase tracking-wider px-3 py-1.5 rounded-full border border-white/15 text-[var(--ink-1)] hover:border-[var(--hud-accent-2)] flex-shrink-0"
            >
              ⭳ Save matchup
            </button>
          </div>
        )}
      </div>

      {result && result.team.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr,1fr] gap-4 items-start">
          <div className="glass rounded-[14px] p-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="font-mono-hud text-[13px] uppercase tracking-[0.2em] text-[var(--hud-accent-2)]">
                Coverage - your draft vs their team
              </div>
              <div className="flex items-center gap-1 mono-panel rounded-full p-0.5" title="Assumed opponent investment">
                {BULK_TABS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => changeBulk(b.id)}
                    aria-pressed={bulk === b.id}
                    className={`font-mono-hud text-[12px] uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${
                      bulk === b.id ? 'bg-[var(--hud-accent-2)] text-black' : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `120px repeat(${result.oppOrder.length}, minmax(0,1fr))` }}>
                <div />
                {result.oppOrder.map((o, oi) => (
                  <div key={`${o.p.id}-${oi}`} className="flex flex-col items-center gap-0.5">
                    <PokemonSprite dex={o.p.dex} name={o.p.name} size="xs" />
                    <div className="font-mono-hud text-[11px] text-[var(--ink-1)] truncate max-w-full">{o.p.name}</div>
                  </div>
                ))}
              </div>
              {result.team.map((t, ri) => (
                <div key={t.rec.id} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: `120px repeat(${result.oppOrder.length}, minmax(0,1fr))` }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <PokemonSprite dex={t.p.dex} name={t.p.name} size="xs" />
                    <span className="font-display text-[13px] font-semibold truncate">{t.rec.nickname || t.p.name}</span>
                  </div>
                  {result.matrix[ri].map((cell, oi) => (
                    <div
                      key={oi}
                      title={cell.moveName ? `${cell.moveName} · ${cell.label} ${cell.sub}` : cell.label}
                      className={`h-[46px] rounded-[7px] border flex flex-col items-center justify-center font-mono-hud leading-none gap-0.5 px-1 ${VERDICT_CLASS[cell.verdict]}`}
                    >
                      <span className="text-[14px]">{cell.label} <span className="opacity-85 text-[11px]">{cell.sub}</span></span>
                      <span className="text-[10px] opacity-70 truncate max-w-full">{cell.moveName ?? '-'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex gap-4 mt-3 font-mono-hud text-[13px] text-[var(--ink-2)]">
              <span><i className="inline-block w-2.5 h-2.5 rounded-[3px] mr-1.5 align-middle bg-[var(--hud-accent-2)]" />outspeed + KO / wall</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded-[3px] mr-1.5 align-middle bg-[#e9a425]" />trade / check</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded-[3px] mr-1.5 align-middle bg-[var(--hud-danger)]" />loses</span>
            </div>
          </div>

          <div className="glass rounded-[14px] p-3.5 flex flex-col gap-3">
            <div className="font-mono-hud text-[13px] uppercase tracking-[0.2em] text-[var(--hud-accent-2)]">Game plan</div>
            {result.tips.lead && (
              <Tip k="Lead" v={<><b className="text-[var(--hud-accent)]">{result.tips.lead.name}</b> - outspeeds {result.tips.lead.outspeeds} of their {result.oppOrder.length}</>} />
            )}
            {result.tips.winCondition && (
              <Tip k="Win condition" v={<><b className="text-[var(--hud-accent)]">{result.tips.winCondition.name}</b> - your strongest overall attacker</>} />
            )}
            {result.tips.biggestHole && (
              <Tip k="Biggest hole" v={<><span className="text-[var(--hud-danger)]">{result.tips.biggestHole.oppName}</span> - {result.tips.biggestHole.bestVerdict === 'win' ? 'answered, but it is your weakest matchup' : result.tips.biggestHole.bestVerdict === 'trade' ? 'only a check; play around it' : 'no answer on this team'}</>} />
            )}
            <div className="border-t border-dashed border-white/10 pt-2.5">
              <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">Per-threat answers</div>
              {result.tips.perThreat.map((t, ti) => (
                <div key={`${t.oppId}-${ti}`} className="flex gap-2 items-baseline text-[13px] mb-1">
                  <span className="font-mono-hud text-[var(--ink-2)]">{t.oppName} →</span>
                  <b className="font-display font-semibold">{t.pcName ?? '-'}</b>
                  {t.cell?.moveName && <span className="font-mono-hud text-[12px] text-[var(--ink-2)]">· {t.cell.moveName}</span>}
                  {t.cell && (
                    <span className={`font-mono-hud text-[12px] px-1.5 rounded-full ${VERDICT_CLASS[t.cell.verdict]}`}>{t.cell.label} {t.cell.sub}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {savedDrafts.length > 0 && (
        <div className="glass rounded-[14px] p-3.5 mt-4">
          <div className="font-mono-hud text-[13px] uppercase tracking-[0.2em] text-[var(--hud-accent-2)] mb-2">
            Saved matchups
          </div>
          <div className="flex flex-col gap-1.5">
            {savedDrafts.map((d) => (
              <div key={d.id} className="flex items-center gap-3 bg-white/[.03] border border-white/10 rounded-[10px] px-3 py-2">
                <span className="font-display text-[14px] font-semibold truncate min-w-0 flex-1">{d.label}</span>
                <span className="flex gap-1 flex-shrink-0">
                  {d.opponents.slice(0, 6).map((s, i) => {
                    const p = pokemonById[s.speciesId];
                    return p ? <PokemonSprite key={i} dex={p.dex} name={p.name} size="xs" /> : null;
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => reanalyze(d)}
                  className="font-mono-hud text-[12px] uppercase tracking-wider px-3 py-1 rounded-full border border-white/15 text-[var(--ink-1)] hover:border-[var(--hud-accent-2)] flex-shrink-0"
                >
                  ↻ Re-analyze
                </button>
                <button
                  type="button"
                  onClick={() => deleteSaved(d.id)}
                  aria-label={`Delete ${d.label}`}
                  className="font-mono-hud text-[15px] text-[var(--ink-2)] hover:text-[var(--hud-danger)] flex-shrink-0"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModuleFrame>
  );
}

/**
 * Level field that holds its own editable string so you can fully clear it
 * (an empty box doesn't snap back to 1 mid-edit) and is wide enough not to clip
 * "100". Commits a clamped 1–100 value on blur / Enter.
 */
function LevelInput({
  value,
  disabled,
  title,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  title?: string;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n)) onCommit(Math.max(1, Math.min(100, n)));
    else setDraft(String(value));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={disabled ? String(value) : draft}
      disabled={disabled}
      title={title}
      aria-label="Level"
      onChange={(e) => {
        const v = e.target.value;
        if (/^\d{0,3}$/.test(v)) setDraft(v);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className="w-16 bg-black/40 border border-white/15 rounded-full px-2.5 py-0.5 font-mono-hud text-[13px] text-center text-[var(--ink-0)] outline-none focus:border-[var(--hud-accent-2)] disabled:opacity-50"
    />
  );
}

function Tip({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="border border-white/10 bg-white/[.035] rounded-[10px] px-2.5 py-2">
      <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--hud-accent-2)]">{k}</div>
      <div className="font-display text-[14px] font-semibold mt-0.5">{v}</div>
    </div>
  );
}
