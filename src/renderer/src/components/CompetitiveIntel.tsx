import type { SmogonBundle, SmogonSet, SmogonSpeciesIntel } from '../lib/smogon';

const STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

function evLine(evs: number[]): string {
  return evs
    .map((v, i) => (v > 0 ? `${v} ${STAT_LABELS[i]}` : null))
    .filter(Boolean)
    .join(' / ');
}

function SmogonSetCard({ name, set }: { name: string; set: SmogonSet }) {
  return (
    <div className="mono-panel p-3 rounded-[10px] flex flex-col gap-1.5 min-w-0">
      <div className="font-display text-[14px] font-bold text-[var(--ink-0)] truncate">{name}</div>
      <div className="font-mono-hud text-[13px] text-[var(--ink-1)]">
        {set.item.join(' / ') || 'No item'} · {set.ability ?? '-'} · {set.nature ?? '-'}
      </div>
      {evLine(set.evs) && (
        <div className="font-mono-hud text-[12px] tabular-nums text-[var(--ink-2)]">EVs {evLine(set.evs)}</div>
      )}
      <div className="flex flex-col gap-0.5 mt-0.5">
        {set.moves.map((slot, i) => (
          <div key={i} className="font-display text-[14px] font-semibold text-[var(--ink-0)] truncate">
            <span className="font-mono-hud text-[11px] text-[var(--ink-2)] mr-1.5">{i + 1}</span>
            {slot.join(' / ')}
          </div>
        ))}
      </div>
    </div>
  );
}

function PctRow({ name, pct }: { name: string; pct: number }) {
  return (
    <div className="relative flex items-center justify-between gap-2 px-1.5 -mx-1.5 py-0.5 rounded-[4px] overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-[4px] bg-[var(--hud-accent-2)] opacity-[.08]"
        style={{ width: `${Math.min(100, pct)}%` }}
      />
      <span className="relative font-display text-[13px] font-semibold text-[var(--ink-0)] truncate">
        {name}
      </span>
      <span className="relative font-mono-hud text-[12px] tabular-nums text-[var(--ink-1)] flex-shrink-0">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

const INTEL_HEADER = 'font-mono-hud text-[11px] uppercase tracking-[0.16em] text-[var(--hud-accent-2)] opacity-70 mb-1.5';

export function CompetitiveIntel({
  intel,
  meta,
  onSelectSpecies,
  isSelectable,
}: {
  intel: SmogonSpeciesIntel;
  meta: SmogonBundle['meta'];
  onSelectSpecies: (id: string) => void;
  /**
   * Optional gate for teammate/check navigation. When omitted, every chip is
   * clickable (the Pokédex can open any species). The Smogon viewer passes a
   * predicate so chips pointing at species absent from the usage bundle render
   * disabled instead of silently no-opping.
   */
  isSelectable?: (id: string) => boolean;
}) {
  const canSelect = (id: string) => (isSelectable ? isSelectable(id) : true);
  const sets = Object.entries(intel.sets ?? {});
  return (
    <div>
      <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
        ◢ COMPETITIVE INTEL ·{' '}
        <span className="text-[var(--ink-2)]">
          {meta.label} {meta.month} · {(intel.usage * 100).toFixed(1)}% usage · #{intel.rank}
        </span>
      </div>

      {sets.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {sets.map(([name, set]) => (
            <SmogonSetCard key={name} name={name} set={set} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5 mb-3">
        <div className="mono-panel p-3 rounded-[10px]">
          <div className={INTEL_HEADER}>
            Top moves
          </div>
          <div className="flex flex-col gap-0.5">
            {intel.moves.slice(0, 6).map((m) => (
              <PctRow key={m.name} name={m.name} pct={m.pct} />
            ))}
          </div>
        </div>
        <div className="mono-panel p-3 rounded-[10px]">
          <div className={INTEL_HEADER}>
            Items
          </div>
          <div className="flex flex-col gap-0.5">
            {intel.items.slice(0, 6).map((m) => (
              <PctRow key={m.name} name={m.name} pct={m.pct} />
            ))}
          </div>
        </div>
        <div className="mono-panel p-3 rounded-[10px]">
          <div className={INTEL_HEADER}>
            Spreads
          </div>
          <div className="flex flex-col gap-0.5">
            {intel.spreads.slice(0, 4).map((s, i) => (
              <PctRow key={i} name={`${s.nature} ${evLine(s.evs)}`} pct={s.pct} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {intel.teammates.length > 0 && (
          <div className="mono-panel p-3 rounded-[10px]">
            <div className={INTEL_HEADER}>
              Common teammates
            </div>
            <div className="flex flex-wrap gap-1.5">
              {intel.teammates.slice(0, 8).map((t) => {
                const selectable = canSelect(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!selectable}
                    onClick={() => selectable && onSelectSpecies(t.id)}
                    title={
                      selectable
                        ? `On ${t.pct.toFixed(1)}% of ${intel.name} teams - click to open`
                        : `On ${t.pct.toFixed(1)}% of ${intel.name} teams - no usage data`
                    }
                    className={`font-display text-[13px] font-semibold px-2 py-0.5 rounded-full border border-white/15 bg-black/30 text-[var(--ink-0)] transition ${
                      selectable ? 'hover:border-[var(--hud-accent-2)]' : 'opacity-50 cursor-default'
                    }`}
                  >
                    {t.name} <span className="font-mono-hud text-[11px] text-[var(--ink-2)]">{Math.round(t.pct)}%</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {intel.checks.length > 0 && (
          <div className="mono-panel p-3 rounded-[10px]">
            <div className={INTEL_HEADER}>
              Checks &amp; counters
            </div>
            <div className="flex flex-col gap-0.5">
              {intel.checks.map((c) => {
                const selectable = canSelect(c.id);
                return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!selectable}
                  onClick={() => selectable && onSelectSpecies(c.id)}
                  className={`relative flex items-center justify-between gap-2 text-left rounded-[4px] px-1.5 -mx-1.5 py-0.5 overflow-hidden transition ${
                    selectable ? 'hover:bg-white/[.05]' : 'opacity-50 cursor-default'
                  }`}
                  title="Matchup rating - fraction of encounters this check KOs or forces out. Click to open."
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-[4px] bg-[var(--hud-danger)] opacity-[.08]"
                    style={{ width: `${Math.min(100, c.score * 100)}%` }}
                  />
                  <span className="relative font-display text-[13px] font-semibold text-[var(--ink-0)] truncate">
                    {c.name}
                  </span>
                  <span
                    className="relative font-mono-hud text-[12px] tabular-nums font-semibold flex-shrink-0"
                    style={{ color: c.score >= 0.7 ? 'var(--hud-danger)' : 'var(--ink-1)' }}
                  >
                    {(c.score * 100).toFixed(0)}
                  </span>
                </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
