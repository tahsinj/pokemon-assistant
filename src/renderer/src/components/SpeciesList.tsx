import { useMemo, useState } from 'react';
import type { Pokemon } from '../lib/types';
import { buildSpeciesFuse } from '../lib/fuzzySpecies';
import { TYPES } from '../lib/typechart';
import { TypeBadge } from './TypeBadge';
import { PokemonSprite } from './PokemonSprite';

export function SpeciesList({
  pokemon,
  selectedId,
  onSelect,
}: {
  pokemon: Pokemon[];
  selectedId?: string;
  onSelect: (p: Pokemon) => void;
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
    <div className="species-list-shell">
      <div className="species-list-filters">
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <input
            placeholder="Search species…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search species by name"
            style={{ flex: 1 }}
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 6 }}>
          {filtered.length} species
        </div>
      </div>
      <div className="species-list-scroll">
        {filtered.length === 0 ? (
          <div className="species-empty">No species match your filters.</div>
        ) : (
          <ul className="species-ul">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === p.id}
                  className={`species-row ${selectedId === p.id ? 'selected' : ''}`}
                  onClick={() => onSelect(p)}
                >
                  <PokemonSprite dex={p.dex} name={p.name} size="xs" />
                  <span className="dex">#{String(p.dex).padStart(4, '0')}</span>
                  <span className="name">{p.name}</span>
                  <span>{p.types.map((t) => <TypeBadge key={t} type={t} />)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
