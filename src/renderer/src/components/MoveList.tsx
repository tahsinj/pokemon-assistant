import { useMemo, useState } from 'react';
import type { Move } from '../lib/types';
import { TYPES } from '../lib/typechart';
import { TypeChip } from './hud/HudPrimitives';
import { SearchPill } from './hud/ModuleFrame';

type SortKey = 'name' | 'power' | 'accuracy' | 'pp';
type CatFilter = 'all' | Move['category'];

const CAT_FILTERS: CatFilter[] = ['all', 'Physical', 'Special', 'Status'];
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'name', label: 'A–Z' },
  { id: 'power', label: 'Power' },
  { id: 'accuracy', label: 'Acc' },
  { id: 'pp', label: 'PP' },
];

const accVal = (a: Move['accuracy']) => (a === true ? 100 : a);

export function MoveList({
  moves,
  selectedId,
  onSelect,
}: {
  moves: Move[];
  selectedId?: string;
  onSelect: (m: Move) => void;
}) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [catFilter, setCatFilter] = useState<CatFilter>('all');
  const [sort, setSort] = useState<SortKey>('name');

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = moves.filter((m) => {
      if (typeFilter && m.type.toLowerCase() !== typeFilter) return false;
      if (catFilter !== 'all' && m.category !== catFilter) return false;
      if (ql && !m.name.toLowerCase().includes(ql)) return false;
      return true;
    });
    out.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'power') return (b.power || 0) - (a.power || 0) || a.name.localeCompare(b.name);
      if (sort === 'accuracy') return accVal(b.accuracy) - accVal(a.accuracy) || a.name.localeCompare(b.name);
      return b.pp - a.pp || a.name.localeCompare(b.name);
    });
    return out;
  }, [moves, q, typeFilter, catFilter, sort]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <SearchPill value={q} onChange={setQ} placeholder="Search moves…" width="100%" ariaLabel="Search moves by name" />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
          className="bg-black/40 border border-white/15 rounded-full px-3 py-1.5 font-mono-hud text-[14px] uppercase tracking-wider text-[var(--ink-1)] outline-none focus:border-[var(--hud-accent-2)]"
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex gap-1">
          {CAT_FILTERS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              aria-pressed={catFilter === c}
              className={`font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition ${
                catFilter === c
                  ? 'bg-white/10 border-[var(--hud-accent-2)]/50 text-[var(--ink-0)]'
                  : 'bg-white/[.03] border-white/10 text-[var(--ink-2)] hover:bg-white/[.06]'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              aria-pressed={sort === s.id}
              className={`font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full border transition ${
                sort === s.id
                  ? 'bg-white/10 border-[var(--hud-accent-2)]/50 text-[var(--ink-0)]'
                  : 'bg-white/[.03] border-white/10 text-[var(--ink-2)] hover:bg-white/[.06]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)] mb-2 px-1">
        {filtered.length} moves
      </div>

      <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar">
        {filtered.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-[var(--ink-2)] px-2 py-4 text-center">No moves match your filters.</div>
        ) : (
          filtered.map((m) => {
            const isSel = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isSel}
                onClick={() => onSelect(m)}
                className={`relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-[10px] text-left transition border overflow-hidden ${
                  isSel ? 'bg-white/10 border-[var(--hud-accent-2)]/40' : 'bg-white/[.03] border-white/5 hover:bg-white/[.06]'
                }`}
              >
                <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `var(--t-${m.type.toLowerCase()})` }} />
                <span className="font-display text-[15px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">{m.name}</span>
                <TypeChip t={m.type.toLowerCase()} />
                <span className="font-mono-hud text-[12px] text-[var(--ink-2)] w-9 text-right flex-shrink-0" title={m.category}>
                  {m.category === 'Physical' ? 'PHY' : m.category === 'Special' ? 'SPC' : 'STA'}
                </span>
                <span className="font-mono-hud text-[13px] text-[var(--ink-1)] w-8 text-right flex-shrink-0">{m.power || '-'}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
