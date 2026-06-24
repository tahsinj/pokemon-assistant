import { useMemo, useState, type ReactNode } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { draftCounterTeam, evaluateTeam, type DraftResult, type Candidate, type OpponentEntry } from '../lib/counterDraft';
import type { OpponentBulk } from '../lib/opponentSet';
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

interface OppSlot { p: Pokemon; level: number; }

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

  const candidates = useMemo<Candidate[]>(() => {
    const maxLevel = opponents.reduce((m, o) => Math.max(m, o.level), 1);
    const minLevel = maxLevel * 0.6;
    const out: Candidate[] = [];
    for (const rec of pc.mons) {
      if (rec.level < minLevel) continue;
      const p = pokemonById[rec.speciesId];
      if (p) out.push({ rec, p });
    }
    return out;
  }, [pc.mons, pokemonById, opponents]);

  const addOpponent = (p: Pokemon) => {
    if (opponents.length >= 6) return;
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

  const runDraft = () => {
    const opps: OpponentEntry[] = opponents.map((o) => ({ p: o.p, level: o.level }));
    setResult(draftCounterTeam(opps, candidates, moves, smogon, bulk));
  };

  // Switching tabs re-scores the SAME drafted team under the new assumption.
  const changeBulk = (next: OpponentBulk) => {
    setBulk(next);
    setResult((prev) => {
      if (!prev) return prev;
      const opps: OpponentEntry[] = opponents.map((o) => ({ p: o.p, level: o.level }));
      const { matrix, oppOrder, tips } = evaluateTeam(prev.team, opps, moves, smogon, next);
      return { ...prev, matrix, oppOrder, tips };
    });
  };

  return (
    <ModuleFrame kicker="◢ MATCHUP DRAFT" title="Counter Draft" subtitle="Build a PC answer to their team">
      <div className="glass rounded-[14px] p-3.5 mb-4">
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
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={o.level}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setLevel(i, Math.max(1, Math.min(100, Math.round(v))));
                  }}
                  className="w-14 bg-black/40 border border-white/15 rounded-full px-2 py-0.5 font-mono-hud text-[13px] text-center text-[var(--ink-0)] outline-none focus:border-[var(--hud-accent-2)]"
                />
              </div>
            </div>
          ))}
          {opponents.length < 6 && (
            <button
              type="button"
              onClick={() => setPicking((v) => !v)}
              className="border border-dashed border-white/15 rounded-[12px] min-h-[104px] flex flex-col items-center justify-center font-mono-hud text-[15px] text-[var(--ink-2)] hover:border-[var(--hud-accent-2)] hover:text-[var(--ink-1)] transition"
            >
              ＋<br />add mon
            </button>
          )}
        </div>

        {picking && (
          <div className="mt-3 h-[38vh] min-h-[240px] glass rounded-[12px] p-2">
            <SpeciesList pokemon={pokemon} onSelect={addOpponent} />
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
    </ModuleFrame>
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
