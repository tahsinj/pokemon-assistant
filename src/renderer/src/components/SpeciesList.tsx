import { useMemo, useState } from 'react';
import type { Pokemon } from '../lib/types';
import { buildSpeciesFuse } from '../lib/fuzzySpecies';
import { bst } from '../lib/stats';
import { TYPES } from '../lib/typechart';
import { TypeChip } from './hud/HudPrimitives';
import { SearchPill } from './hud/ModuleFrame';
import { PokemonSprite } from './PokemonSprite';

export function SpeciesList({
  pokemon,
  selectedId,
  onSelect,
  compact,
}: {
  pokemon: Pokemon[];
  selectedId?: string;
  onSelect: (p: Pokemon) => void;
  /** Narrow columns: drop the dex number so the name has room (avoids clipping). */
  compact?: boolean;
}) {
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const fuse = useMemo(() => buildSpeciesFuse(pokemon), [pokemon]);
  const filtered = useMemo(() => {
    const ql = q.trim();
    const byType = (p: Pokemon) =>
      !typeFilter || p.types.map((t) => t.toLowerCase()).includes(typeFilter);
    const base = pokemon.filter(byType);
    if (!ql) return base;
    if (ql.length < 2) {
      const qlo = ql.toLowerCase();
      return base.filter((p) => p.name.toLowerCase().includes(qlo));
    }
    const seen = new Set<string>();
    const out: Pokemon[] = [];
    for (const r of fuse.search(ql)) {
      if (!byType(r.item)) continue;
      if (seen.has(r.item.id)) continue;
      seen.add(r.item.id);
      out.push(r.item);
    }
    if (out.length === 0) {
      const qlo = ql.toLowerCase();
      return base.filter((p) => p.name.toLowerCase().includes(qlo));
    }
    return out;
  }, [pokemon, q, typeFilter, fuse]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <SearchPill
            value={q}
            onChange={setQ}
            placeholder="Search species…"
            width="100%"
            ariaLabel="Search species by name"
          />
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
      <div className="font-mono-hud text-[13px] uppercase tracking-wider text-ink-2 mb-2 px-1">
        {filtered.length} species
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar">
        {filtered.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-ink-2 px-2 py-4 text-center">
            No species match your filters.
          </div>
        ) : (
          filtered.map((p) => {
            const isSel = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={isSel}
                onClick={() => onSelect(p)}
                className={`flex items-center gap-3 px-3 py-2 rounded-[10px] text-left transition border ${
                  isSel
                    ? 'bg-white/10 border-accent-2/40'
                    : 'bg-white/[.03] border-white/5 hover:bg-white/[.06]'
                }`}
              >
                <PokemonSprite dex={p.dex} name={p.name} size="xs" />
                {!compact && (
                  <span className="font-mono-hud text-[14px] text-ink-2 w-12 flex-shrink-0">
                    #{String(p.dex).padStart(4, '0')}
                  </span>
                )}
                <span className="font-display text-[15px] font-semibold flex-1 min-w-0 truncate text-ink-0">
                  {p.name}
                </span>
                <span className="flex gap-1 flex-shrink-0">
                  {p.types.map((t) => (
                    <TypeChip key={t} t={t.toLowerCase()} />
                  ))}
                </span>
                <span className="font-mono-hud text-[13px] text-ink-1 w-10 text-right flex-shrink-0">
                  {bst(p.baseStats)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
