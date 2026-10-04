import { useMemo, useState, type CSSProperties } from 'react';
import type { Move } from '../lib/types';
import { TYPES } from '../lib/typechart';
import { TypeChip } from './hud/HudPrimitives';
import { SearchPill } from './hud/ModuleFrame';
import { Segmented } from './hud/Segmented';

type SortKey = 'name' | 'power' | 'accuracy' | 'pp';
type CatFilter = 'all' | Move['category'];

const accVal = (a: Move['accuracy']) => (a === true ? 100 : a);
const CAT_LETTER: Record<Move['category'], string> = { Physical: 'PHY', Special: 'SPC', Status: 'STA' };

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
          className="bg-black/40 border border-white/15 rounded-full px-3 py-1.5 font-mono-hud text-[14px] uppercase tracking-wider text-ink-1 outline-none focus:border-accent-2"
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
        <Segmented
          value={catFilter}
          onChange={setCatFilter}
          options={[
            { id: 'all', label: 'All' },
            { id: 'Physical', label: 'Phys' },
            { id: 'Special', label: 'Spec' },
            { id: 'Status', label: 'Status' },
          ]}
        />
        <Segmented
          value={sort}
          onChange={setSort}
          options={[
            { id: 'name', label: 'A–Z' },
            { id: 'power', label: 'Pwr' },
            { id: 'accuracy', label: 'Acc' },
            { id: 'pp', label: 'PP' },
          ]}
        />
      </div>

      <div className="font-mono-hud text-[13px] uppercase tracking-wider text-ink-2 mb-2 px-1">
        {filtered.length} moves
      </div>

      <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar">
        {filtered.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-ink-2 px-2 py-4 text-center">No moves match your filters.</div>
        ) : (
          filtered.map((m) => {
            const isSel = selectedId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={isSel}
                onClick={() => onSelect(m)}
                style={{ borderLeft: `3px solid var(--t-${m.type.toLowerCase()})` } as CSSProperties}
                className={`grid grid-cols-[1fr,auto,30px,32px] items-center gap-3 pl-3 pr-3 py-2 rounded-[10px] text-left transition border ${
                  isSel ? 'bg-white/10 border-accent-2/40' : 'bg-white/[.03] border-white/5 hover:bg-white/[.06]'
                }`}
              >
                <span className="font-display text-[15px] font-semibold leading-normal truncate min-w-0 text-ink-0">
                  {m.name}
                </span>
                <TypeChip t={m.type.toLowerCase()} />
                <span className="font-mono-hud text-[12px] text-ink-2 text-right" title={m.category}>
                  {CAT_LETTER[m.category]}
                </span>
                <span className="font-mono-hud text-[13px] text-ink-1 text-right">{m.power || '-'}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
