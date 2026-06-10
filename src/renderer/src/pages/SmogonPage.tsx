import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { buildLeaderboard, maxUsage, type SmogonSortMode } from '../lib/smogonLeaderboard';
import { bst } from '../lib/stats';
import { TYPES } from '../lib/typechart';
import { ModuleFrame, SearchPill } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { PokemonSprite } from '../components/PokemonSprite';
import { CompetitiveIntel } from '../components/CompetitiveIntel';

const SORTS: { id: SmogonSortMode; label: string }[] = [
  { id: 'usage', label: 'Usage' },
  { id: 'alpha', label: 'A–Z' },
  { id: 'bst', label: 'BST' },
];

export function SmogonPage({
  pokemon,
  moves: _moves,
  smogon,
}: { pokemon: Pokemon[]; moves: Record<string, Move>; smogon: SmogonBundle | null }) {
  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = useState<SmogonSortMode>('usage');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const entries = useMemo(
    () => (smogon ? buildLeaderboard(smogon, pokemonById, { search: q, type: typeFilter, sort }) : []),
    [smogon, pokemonById, q, typeFilter, sort],
  );
  const top = useMemo(() => maxUsage(entries), [entries]);

  // Default selection: first entry. Fall back if the current selection is
  // filtered out.
  const activeId =
    selectedId && entries.some((e) => e.pokemon.id === selectedId)
      ? selectedId
      : (entries[0]?.pokemon.id ?? null);
  const active = activeId ? smogon?.species[activeId] ?? null : null;
  const activeMon = activeId ? pokemonById[activeId] ?? null : null;

  if (!smogon) {
    return (
      <ModuleFrame kicker="◢ SMOGON" title="Smogon Intel" subtitle="Usage rankings & strategy">
        <div className="font-mono-hud text-[15px] text-[var(--ink-2)] px-2 py-10 text-center">
          Smogon intel not available - run <span className="text-[var(--hud-accent-2)]">npm run fetch-smogon</span> to
          generate the data bundle.
        </div>
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      kicker="◢ SMOGON"
      title="Smogon Intel"
      subtitle={`${smogon.meta.label} · ${smogon.meta.month} · ${smogon.meta.battles.toLocaleString()} battles`}
    >
      <div className="grid grid-cols-[minmax(320px,460px),1fr] gap-5 items-start">
        {/* Leaderboard */}
        <div className="flex flex-col h-[62vh] min-h-[320px]">
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

          <div className="flex items-center justify-between mb-2 px-1">
            <span className="font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)]">
              {entries.length} species
            </span>
            <div className="flex gap-1">
              {SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  aria-pressed={sort === s.id}
                  className={`font-mono-hud text-[13px] uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition ${
                    sort === s.id
                      ? 'bg-[var(--hud-accent)] border-transparent text-[#100b06]'
                      : 'border-white/15 text-[var(--ink-1)] hover:border-[var(--hud-accent-2)]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-1 min-h-0 overflow-y-auto pr-1 no-scrollbar">
            {entries.length === 0 ? (
              <div className="font-mono-hud text-[14px] text-[var(--ink-2)] px-2 py-4 text-center">
                No species match your filters.
              </div>
            ) : (
              entries.map((e, i) => {
                const isSel = e.pokemon.id === activeId;
                const rank = sort === 'usage' ? e.intel.rank : i + 1;
                return (
                  <button
                    key={e.pokemon.id}
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => setSelectedId(e.pokemon.id)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-[10px] text-left transition border ${
                      isSel
                        ? 'bg-white/10 border-[var(--hud-accent)]/55'
                        : 'bg-white/[.03] border-white/5 hover:bg-white/[.06]'
                    }`}
                  >
                    <span className="font-mono-hud text-[15px] text-[var(--ink-2)] w-7 text-right flex-shrink-0">
                      {rank}
                    </span>
                    <PokemonSprite dex={e.pokemon.dex} name={e.pokemon.name} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="font-display text-[15px] font-semibold truncate text-[var(--ink-0)] block">
                        {e.pokemon.name}
                      </span>
                      <span className="flex gap-1 mt-0.5">
                        {e.pokemon.types.map((t) => (
                          <TypeChip key={t} t={t.toLowerCase()} />
                        ))}
                      </span>
                    </span>
                    {sort === 'bst' ? (
                      <span className="font-mono-hud text-[14px] text-[var(--ink-1)] w-10 text-right flex-shrink-0 tabular-nums">
                        {bst(e.pokemon.baseStats)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 flex-shrink-0">
                        <span className="statbar w-[80px]">
                          <span
                            className="fill"
                            style={{ width: `${top ? (e.intel.usage / top) * 100 : 0}%` }}
                          />
                        </span>
                        <span className="font-mono-hud text-[15px] text-[var(--ink-0)] w-10 text-right tabular-nums">
                          {(e.intel.usage * 100).toFixed(1)}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Strategy lens */}
        <div className="min-w-0">
          {active && activeMon ? (
            <>
              <div className="flex items-center gap-3 mb-3">
                <PokemonSprite dex={activeMon.dex} name={activeMon.name} size="md" />
                <div className="min-w-0">
                  <div className="font-display text-[24px] font-bold text-[var(--ink-0)] leading-none truncate">
                    {activeMon.name}
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    {activeMon.types.map((t) => (
                      <TypeChip key={t} t={t.toLowerCase()} size="md" />
                    ))}
                  </div>
                </div>
              </div>
              <CompetitiveIntel
                intel={active}
                meta={smogon.meta}
                isSelectable={(id) => !!(pokemonById[id] && smogon.species[id])}
                onSelectSpecies={(id) => {
                  if (pokemonById[id] && smogon.species[id]) setSelectedId(id);
                }}
              />
              <div className="font-mono-hud text-[13px] tracking-wide text-[var(--ink-2)] text-center mt-4">
                Usage data: Smogon · smogon.com/stats · {smogon.meta.month}
              </div>
            </>
          ) : (
            <div className="font-mono-hud text-[14px] text-[var(--ink-2)] px-2 py-10 text-center">
              Select a species to see its strategy.
            </div>
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}
