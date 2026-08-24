import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import {
  offensiveCoverage,
  threatSummary,
  quickVerdict,
  type CoverageEntry,
} from '../lib/coverageProfile';
import type { MatchupCell } from '../lib/matchup';
import { TypeChip } from './hud/HudPrimitives';
import { PokemonSprite } from './PokemonSprite';

/**
 * Beginner matchup panel for a single species: which types it reliably hits hard
 * (from popular movesets, not just typing), which common meta mons it should
 * AVOID (faster + super-effective), and a quick "should I send this in vs X?"
 * speed-aware verdict. Pure-logic lives in lib/coverageProfile.ts.
 */
export function CoverageThreats({
  p,
  moves,
  smogon,
  allPokemon,
  onSelectSpecies,
}: {
  p: Pokemon;
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
  allPokemon: Pokemon[];
  onSelectSpecies: (id: string) => void;
}) {
  const intel = smogon?.species[p.id] ?? null;

  const coverage = useMemo(() => offensiveCoverage(p, moves, intel), [p, moves, intel]);
  const threats = useMemo(
    () => threatSummary(p, allPokemon, smogon, moves),
    [p, allPokemon, smogon, moves],
  );

  // Bucket coverage by how often a set carries the move (usage data only).
  const reliable: CoverageEntry[] = [];
  const sometimes: CoverageEntry[] = [];
  const rare: CoverageEntry[] = [];
  for (const e of coverage.entries) {
    if (!coverage.hasUsage) reliable.push(e);
    else if ((e.prob ?? 0) >= 0.5) reliable.push(e);
    else if ((e.prob ?? 0) >= 0.15) sometimes.push(e);
    else rare.push(e);
  }

  const riskyTop = threats.riskyTypes.slice(0, 5);
  const fastTop = threats.fastThreats.slice(0, 6);

  return (
    <div className="flex flex-col gap-3">
      <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)]">
        ◢ COVERAGE & THREATS ·{' '}
        <span className="text-[var(--ink-2)]">
          {coverage.hasUsage ? 'from popular movesets' : 'from recommended set (no usage data)'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Offensive: what it hits hard ── */}
        <div className="mono-panel p-3 rounded-[10px] flex flex-col gap-2">
          <div className="font-mono-hud text-[12px] uppercase tracking-wider" style={{ color: '#7cd87b' }}>
            Strong into
          </div>
          {coverage.entries.length === 0 ? (
            <div className="font-mono-hud text-[13px] text-[var(--ink-2)]">
              No reliable super-effective coverage on record.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <CoverageRow label="Reliable" entries={reliable} hasUsage={coverage.hasUsage} />
              {coverage.hasUsage && sometimes.length > 0 && (
                <CoverageRow label="Some sets" entries={sometimes} hasUsage dim />
              )}
              {coverage.hasUsage && rare.length > 0 && (
                <CoverageRow label="Rare" entries={rare} hasUsage dim />
              )}
            </div>
          )}
          <div className="font-mono-hud text-[11px] text-[var(--ink-2)] leading-snug mt-0.5">
            {coverage.hasUsage
              ? '% = how often its sets carry a move that hits this type for 2×+.'
              : 'Super-effective coverage from its recommended STAB + coverage set.'}
          </div>
        </div>

        {/* ── Defensive / threat: what to avoid ── */}
        <div className="mono-panel p-3 rounded-[10px] flex flex-col gap-2">
          <div className="font-mono-hud text-[12px] uppercase tracking-wider" style={{ color: 'var(--hud-danger)' }}>
            Risky into
          </div>
          {!smogon ? (
            <div className="font-mono-hud text-[13px] text-[var(--ink-2)]">
              Meta threat data unavailable.
            </div>
          ) : riskyTop.length === 0 ? (
            <div className="font-mono-hud text-[13px] text-[var(--ink-2)]">
              No common super-effective attackers - solid defensively.
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {riskyTop.map((r) => (
                <span
                  key={r.type}
                  className="inline-flex items-center gap-0.5"
                  title={`Often carried by: ${r.examples.map((e) => e.name).join(', ')}`}
                >
                  <TypeChip t={r.type} />
                  {r.mult >= 4 && <span className="font-mono-hud text-[11px]" style={{ color: 'var(--hud-danger)' }}>×4</span>}
                </span>
              ))}
            </div>
          )}

          {fastTop.length > 0 && (
            <>
              <div className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] mt-1">
                ⚠ Outspeed you & hit super-effectively
              </div>
              <div className="flex flex-wrap gap-1.5">
                {fastTop.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectSpecies(t.id)}
                    title={`${t.name} - ${t.move} (${t.viaType} ${t.mult}×). Click to inspect.`}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-[var(--hud-danger)]/30 bg-[var(--hud-danger)]/10 hover:bg-[var(--hud-danger)]/20 transition"
                  >
                    <PokemonSprite dex={byDex(allPokemon, t.id)} name={t.name} size="xs" />
                    <span className="font-display text-[12px] text-[var(--ink-0)]">{t.name}</span>
                    <TypeChip t={t.viaType} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Quick 1v1 verdict ── */}
      <QuickCheck p={p} moves={moves} smogon={smogon} allPokemon={allPokemon} />
    </div>
  );
}

function byDex(all: Pokemon[], id: string): number {
  return all.find((x) => x.id === id)?.dex ?? 0;
}

function CoverageRow({
  label,
  entries,
  hasUsage,
  dim,
}: {
  label: string;
  entries: CoverageEntry[];
  hasUsage: boolean;
  dim?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${dim ? 'opacity-75' : ''}`}>
      <span className="font-mono-hud text-[11px] uppercase tracking-wider text-[var(--ink-2)] w-[68px] shrink-0">
        {label}
      </span>
      {entries.map((e) => (
        <span key={e.type} className="inline-flex items-center gap-0.5" title={`via ${e.via}${e.stab ? ' (STAB)' : ''}`}>
          <TypeChip t={e.type} />
          {hasUsage && e.prob !== null && (
            <span className="font-mono-hud text-[11px] text-[var(--ink-2)]">{Math.round(e.prob * 100)}%</span>
          )}
        </span>
      ))}
    </div>
  );
}

const VERDICT_STYLE: Record<MatchupCell['verdict'], { box: string; word: string; mark: string }> = {
  win: { box: 'border-[var(--hud-accent-2)]/45 bg-[var(--hud-accent-2)]/15 text-[#d7fff4]', word: 'Good lead', mark: '✓' },
  trade: { box: 'border-[#e9a425]/40 bg-[#e9a425]/15 text-[#ffe6b0]', word: 'Risky trade', mark: '~' },
  lose: { box: 'border-[var(--hud-danger)]/40 bg-[var(--hud-danger)]/12 text-[#ffc9cf]', word: "Don't send in", mark: '✕' },
};

function QuickCheck({
  p,
  moves,
  smogon,
  allPokemon,
}: {
  p: Pokemon;
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
  allPokemon: Pokemon[];
}) {
  const [query, setQuery] = useState('');
  const opp = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allPokemon.find((x) => x.name.toLowerCase() === q) ?? null;
  }, [query, allPokemon]);

  const cell = useMemo(() => {
    if (!opp || opp.id === p.id) return null;
    return quickVerdict(p, opp, smogon, moves, 50);
  }, [opp, p, smogon, moves]);

  return (
    <div className="mono-panel p-3 rounded-[10px] flex flex-col gap-2">
      <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--hud-accent-2)]">
        Should I send {p.name} in vs…?
      </div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type an opponent species…"
        list="coverage-opp-list"
        autoComplete="off"
        className="w-full px-3 py-1.5 rounded-[8px] bg-black/30 border border-white/10 font-display text-[14px] text-[var(--ink-0)] outline-none focus:border-[var(--hud-accent-2)]/50"
      />
      <datalist id="coverage-opp-list">
        {allPokemon.map((x) => (
          <option key={x.id} value={x.name} />
        ))}
      </datalist>

      {query.trim() && !opp && (
        <div className="font-mono-hud text-[12px] text-[var(--ink-2)]">No species matches “{query}”.</div>
      )}
      {opp && opp.id === p.id && (
        <div className="font-mono-hud text-[12px] text-[var(--ink-2)]">Pick a different species.</div>
      )}
      {opp && cell && <VerdictCard p={p} opp={opp} cell={cell} />}
    </div>
  );
}

function VerdictCard({ p, opp, cell }: { p: Pokemon; opp: Pokemon; cell: MatchupCell }) {
  const s = VERDICT_STYLE[cell.verdict];
  const koPct = Math.round(cell.myKoChance * 100);
  const rawBack = Math.round(cell.theirPctMax);
  const backPct = Math.min(100, rawBack);
  const backLabel = rawBack >= 100 ? '100% (a KO)' : `${backPct}%`;
  return (
    <div className={`rounded-[10px] border p-3 flex flex-col gap-1.5 ${s.box}`}>
      <div className="flex items-center gap-2">
        <PokemonSprite dex={opp.dex} name={opp.name} size="sm" />
        <div className="font-display text-[15px] font-bold">
          {s.mark} {s.word}
        </div>
        <span className="font-mono-hud text-[12px] uppercase tracking-wider ml-auto opacity-80">
          {cell.iAmFaster ? '↑ you outspeed' : '↓ they outspeed'}
        </span>
      </div>
      <div className="font-mono-hud text-[12px] leading-snug opacity-90">
        {cell.moveName
          ? <>Your best: <b>{cell.moveName}</b> - {koPct}% to KO ({cell.label}).</>
          : <>You can’t damage {opp.name} meaningfully.</>}{' '}
        They hit back for up to <b>{backLabel}</b>.
      </div>
      <div className="font-mono-hud text-[11px] opacity-70">
        Assumes standard competitive sets, both at Lv 50.
      </div>
    </div>
  );
}
