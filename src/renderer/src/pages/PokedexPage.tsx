import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle, SmogonSet, SmogonSpeciesIntel } from '../lib/smogon';
import { SpeciesList } from '../components/SpeciesList';
import { bst } from '../lib/stats';
import { suggestMoveset, tmPriorities } from '../lib/recommender';
import { defensiveProfile } from '../lib/typechart';
import { getMergedSpecies } from '../lib/battle/dex';
import { summarizeSpeciesDivergence } from '../lib/battle/overrides';
import { ModuleFrame, MoveCard, SpriteFrame } from '../components/hud/ModuleFrame';
import { StatBar, TypeChip } from '../components/hud/HudPrimitives';

export function PokedexPage({
  pokemon,
  moves,
  smogon,
}: { pokemon: Pokemon[]; moves: Record<string, Move>; smogon: SmogonBundle | null }) {
  const [selected, setSelected] = useState<Pokemon | null>(pokemon[0] || null);
  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);
  return (
    <ModuleFrame
      kicker="◢ POKÉDEX"
      title="Field Index"
      subtitle={`${pokemon.length} species · Cobblemon dataset`}
      side={
        selected && (
          <div className="flex gap-1.5">
            {selected.types.map((t) => (
              <TypeChip key={t} t={t.toLowerCase()} size="md" />
            ))}
          </div>
        )
      }
    >
      <div className="grid grid-cols-[minmax(280px,380px),1fr] gap-5 items-start">
        <div className="h-[62vh] min-h-[320px] overflow-hidden">
          <SpeciesList pokemon={pokemon} selectedId={selected?.id} onSelect={setSelected} />
        </div>
        <div className="min-w-0">
          {selected && (
            <PokemonDetail
              p={selected}
              moves={moves}
              smogon={smogon}
              onSelectSpecies={(id) => {
                const next = pokemonById[id];
                if (next) setSelected(next);
              }}
            />
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}

function PokemonDetail({
  p,
  moves,
  smogon,
  onSelectSpecies,
}: {
  p: Pokemon;
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
  onSelectSpecies: (id: string) => void;
}) {
  const intel = smogon?.species[p.id] ?? null;
  const [moveTab, setMoveTab] = useState<'best' | 'levelup' | 'tm'>('best');
  const suggested =
    moveTab === 'tm'
      ? []
      : suggestMoveset(p, moves, { pool: moveTab === 'levelup' ? 'levelup' : 'all', smogon: intel });
  const tms = moveTab === 'tm' ? tmPriorities(p, moves, intel, 8) : [];
  const prof = defensiveProfile(p.types);
  const weaks = Object.entries(prof).filter(([, m]) => m > 1).sort((a, b) => b[1] - a[1]);
  const resists = Object.entries(prof).filter(([, m]) => m < 1 && m > 0).sort((a, b) => a[1] - b[1]);
  const immunes = Object.entries(prof).filter(([, m]) => m === 0);
  const learnable = p.moves
    .map((lm) => ({ learn: lm.learn, mv: moves[lm.move] }))
    .filter((x) => x.mv);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[200px,1fr] gap-5">
        {/* Holo sprite + identity */}
        <div className="flex flex-col gap-2">
          <SpriteFrame dex={p.dex} name={p.name} />
          <div className="font-display text-[17px] font-bold leading-tight text-[var(--ink-0)]">
            {p.name}
            <CobblemonOverrideBadge name={p.name} />
          </div>
          <div className="flex gap-1.5">
            {p.types.map((t) => (
              <TypeChip key={t} t={t.toLowerCase()} />
            ))}
          </div>
          <div className="mono-panel p-2.5 rounded-[8px] font-mono-hud text-[14px] text-[var(--ink-1)]">
            BST <span className="text-white">{bst(p.baseStats)}</span> ·{' '}
            {(p.height / 10).toFixed(1)}m · {(p.weight / 10).toFixed(1)}kg
          </div>
        </div>

        {/* Stats + abilities + matchups */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="mono-panel p-3 rounded-[10px]">
            <div className="flex items-center justify-between mb-1.5 font-mono-hud">
              <div className="text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)]">
                BASE STATS
              </div>
              <div className="text-[14px] text-[var(--ink-2)]">BST {bst(p.baseStats)}</div>
            </div>
            <div className="flex flex-col gap-1">
              {Object.entries(p.baseStats).map(([k, v]) => (
                <StatBar
                  key={k}
                  label={k}
                  value={v}
                  max={180}
                  color={
                    v >= 100
                      ? 'linear-gradient(90deg,#7cd87b,var(--hud-accent-2))'
                      : v >= 70
                        ? 'linear-gradient(90deg,var(--hud-accent),var(--hud-accent-2))'
                        : 'linear-gradient(90deg,#ff7e8d,var(--hud-accent))'
                  }
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]">
              <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1">
                Abilities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.abilities
                  .filter((a) => !p.hiddenAbilities.includes(a))
                  .map((a) => (
                    <span
                      key={a}
                      className="font-display text-[13px] font-semibold px-2 py-0.5 rounded-full border border-white/15 bg-black/30 text-[var(--ink-0)]"
                    >
                      {a}
                    </span>
                  ))}
                {p.hiddenAbilities.map((a) => (
                  <span
                    key={a}
                    className="font-display text-[13px] font-semibold px-2 py-0.5 rounded-full border border-[var(--hud-accent)]/50 bg-black/30 text-[var(--hud-accent)]"
                  >
                    {a} (H)
                  </span>
                ))}
              </div>
            </div>
            <div className="px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]">
              <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1">
                Defending
              </div>
              <div className="flex flex-col gap-1 font-mono-hud text-[13px]">
                {weaks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span style={{ color: 'var(--hud-danger)' }}>WEAK</span>
                    {weaks.map(([t, m]) => (
                      <span key={t} className="inline-flex items-center gap-0.5">
                        <TypeChip t={t.toLowerCase()} />
                        <span className="text-[var(--ink-2)]">×{m}</span>
                      </span>
                    ))}
                  </div>
                )}
                {resists.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span style={{ color: '#7cd87b' }}>RESIST</span>
                    {resists.map(([t, m]) => (
                      <span key={t} className="inline-flex items-center gap-0.5">
                        <TypeChip t={t.toLowerCase()} />
                        <span className="text-[var(--ink-2)]">×{m}</span>
                      </span>
                    ))}
                  </div>
                )}
                {immunes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[var(--ink-2)]">IMMUNE</span>
                    {immunes.map(([t]) => (
                      <TypeChip key={t} t={t.toLowerCase()} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended moveset - tabbed: Smogon-blended / level-up only / TM priorities */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)]">
            ◢ RECOMMENDED MOVESET ·{' '}
            <span className="text-[var(--ink-2)]">
              {moveTab === 'tm'
                ? 'TMs / tutors worth teaching'
                : moveTab === 'levelup'
                  ? 'self-learnt only'
                  : intel
                    ? 'Smogon-blended'
                    : `STAB + coverage, ${p.baseStats.atk >= p.baseStats.spa ? 'physical' : 'special'} bias`}
            </span>
          </div>
          <div className="flex items-center gap-1 mono-panel rounded-full p-0.5 ml-auto">
            {(
              [
                ['best', 'Best set'],
                ['levelup', 'Level-up only'],
                ['tm', 'TM priorities'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMoveTab(id)}
                className={`font-mono-hud text-[12px] uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${
                  moveTab === id
                    ? 'bg-[var(--hud-accent-2)] text-black'
                    : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {moveTab === 'tm' ? (
          tms.length === 0 ? (
            <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-4 text-center">
              No TM or tutor moves beyond its level-up learnset.
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {tms.map(({ move, reasons }, i) => (
                <div
                  key={move.id}
                  title={reasons.join(' · ')}
                  className="grid grid-cols-[28px,1fr,auto,52px,56px] items-center gap-3 px-3 py-1.5 rounded-[8px] border border-white/5 bg-white/[.03] hover:bg-white/[.06] transition"
                >
                  <span className="font-display text-[14px] font-bold text-[var(--hud-accent)]">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-display text-[14px] font-semibold truncate text-[var(--ink-0)]">
                      {move.name}
                    </div>
                    <div className="font-mono-hud text-[11px] text-[var(--ink-2)] truncate">
                      {reasons.join(' · ')}
                    </div>
                  </div>
                  <TypeChip t={move.type.toLowerCase()} />
                  <span className="font-mono-hud text-[13px] text-[var(--ink-1)]">
                    PWR {move.power || '-'}
                  </span>
                  <span className="font-mono-hud text-[13px] text-[var(--ink-1)]">{move.category}</span>
                </div>
              ))}
            </div>
          )
        ) : suggested.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-[var(--ink-2)] py-4 text-center">
            Nothing learnable in this pool.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2.5">
            {suggested.map(({ move, reasons }) => (
              <MoveCard key={move.id} m={move} hint={reasons.join(' · ')} />
            ))}
          </div>
        )}
      </div>

      {/* Smogon competitive intel */}
      {smogon?.species[p.id] && (
        <CompetitiveIntel
          intel={smogon.species[p.id]}
          meta={smogon.meta}
          onSelectSpecies={onSelectSpecies}
        />
      )}

      {/* Full learnset */}
      <div>
        <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
          ◢ FULL LEARNSET · <span className="text-[var(--ink-2)]">{learnable.length} MOVES</span>
        </div>
        <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
          {learnable.map(({ learn, mv }) => (
            <div
              key={`${learn}-${mv.id}`}
              className="grid grid-cols-[1fr,auto,52px,56px,56px] items-center gap-3 px-3 py-1.5 rounded-[8px] border border-white/5 bg-white/[.03] hover:bg-white/[.06] transition"
              title={mv.desc}
            >
              <div className="font-display text-[14px] font-semibold truncate text-[var(--ink-0)]">
                {mv.name}{' '}
                <span className="font-mono-hud text-[12px] text-[var(--ink-2)] uppercase">
                  {learn}
                </span>
              </div>
              <TypeChip t={mv.type.toLowerCase()} />
              <span className="font-mono-hud text-[13px] text-[var(--ink-1)]">{mv.category[0]}</span>
              <span className="font-mono-hud text-[13px] text-[var(--ink-1)]">
                PWR {mv.power || '-'}
              </span>
              <span className="font-mono-hud text-[13px] text-[var(--ink-1)]">
                ACC {mv.accuracy === true ? '-' : mv.accuracy}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const STAT_LABELS = ['HP', 'Atk', 'Def', 'SpA', 'SpD', 'Spe'];

function evLine(evs: number[]): string {
  return evs
    .map((v, i) => (v > 0 ? `${v} ${STAT_LABELS[i]}` : null))
    .filter(Boolean)
    .join(' / ');
}

function SmogonSetCard({ name, set }: { name: string; set: SmogonSet }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mono-panel p-3 rounded-[10px] flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="font-display text-[14px] font-bold text-[var(--ink-0)] truncate">{name}</div>
        {set.description && (
          <button
            type="button"
            className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--hud-accent-2)] flex-shrink-0"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '− HIDE' : '+ WHY'}
          </button>
        )}
      </div>
      <div className="font-mono-hud text-[12px] text-[var(--ink-1)]">
        {set.item.join(' / ') || 'No item'} · {set.ability ?? '-'} · {set.nature ?? '-'}
      </div>
      {evLine(set.evs) && (
        <div className="font-mono-hud text-[12px] text-[var(--ink-2)]">EVs {evLine(set.evs)}</div>
      )}
      <div className="flex flex-col gap-0.5 mt-0.5">
        {set.moves.map((slot, i) => (
          <div key={i} className="font-display text-[13px] font-semibold text-[var(--ink-0)] truncate">
            <span className="font-mono-hud text-[11px] text-[var(--ink-2)] mr-1.5">{i + 1}</span>
            {slot.join(' / ')}
          </div>
        ))}
      </div>
      {open && set.description && (
        <div className="font-mono-hud text-[12px] leading-relaxed text-[var(--ink-1)] mt-1 max-h-[160px] overflow-y-auto pr-1 no-scrollbar">
          {set.description}
        </div>
      )}
    </div>
  );
}

function PctRow({ name, pct }: { name: string; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-2 font-mono-hud text-[13px]">
      <span className="text-[var(--ink-0)] truncate">{name}</span>
      <span className="text-[var(--ink-2)] flex-shrink-0">{pct.toFixed(1)}%</span>
    </div>
  );
}

function CompetitiveIntel({
  intel,
  meta,
  onSelectSpecies,
}: {
  intel: SmogonSpeciesIntel;
  meta: SmogonBundle['meta'];
  onSelectSpecies: (id: string) => void;
}) {
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
          <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">
            Top moves
          </div>
          <div className="flex flex-col gap-0.5">
            {intel.moves.slice(0, 6).map((m) => (
              <PctRow key={m.name} name={m.name} pct={m.pct} />
            ))}
          </div>
        </div>
        <div className="mono-panel p-3 rounded-[10px]">
          <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">
            Items
          </div>
          <div className="flex flex-col gap-0.5">
            {intel.items.slice(0, 6).map((m) => (
              <PctRow key={m.name} name={m.name} pct={m.pct} />
            ))}
          </div>
        </div>
        <div className="mono-panel p-3 rounded-[10px]">
          <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">
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
            <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">
              Common teammates
            </div>
            <div className="flex flex-wrap gap-1.5">
              {intel.teammates.slice(0, 8).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectSpecies(t.id)}
                  title={`On ${t.pct.toFixed(1)}% of ${intel.name} teams - click to open`}
                  className="font-display text-[13px] font-semibold px-2 py-0.5 rounded-full border border-white/15 bg-black/30 text-[var(--ink-0)] hover:border-[var(--hud-accent-2)] transition"
                >
                  {t.name} <span className="font-mono-hud text-[11px] text-[var(--ink-2)]">{Math.round(t.pct)}%</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {intel.checks.length > 0 && (
          <div className="mono-panel p-3 rounded-[10px]">
            <div className="font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] mb-1.5">
              Checks &amp; counters
            </div>
            <div className="flex flex-col gap-0.5">
              {intel.checks.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectSpecies(c.id)}
                  className="flex items-center justify-between gap-2 font-mono-hud text-[13px] text-left hover:bg-white/[.05] rounded px-1 -mx-1 transition"
                  title="Matchup rating - fraction of encounters this check KOs or forces out. Click to open."
                >
                  <span className="text-[var(--ink-0)] truncate">{c.name}</span>
                  <span style={{ color: c.score >= 0.7 ? 'var(--hud-danger)' : 'var(--ink-2)' }}>
                    {(c.score * 100).toFixed(0)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a "Cobblemon variant" pill when the dex overlay reports a divergence
 * from Showdown for this species. Hover tooltip lists every changed field.
 * No-op when the species matches Showdown exactly.
 */
function CobblemonOverrideBadge({ name }: { name: string }) {
  const merged = getMergedSpecies(name);
  if (!merged?.hasOverride || !merged.divergence) return null;
  const lines = summarizeSpeciesDivergence(merged.divergence);
  if (lines.length === 0) return null;
  return (
    <span
      title={`Cobblemon variant\n\n${lines.join('\n')}`}
      className="ml-2 align-middle font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full cursor-help"
      style={{
        background: 'rgba(255, 198, 54, 0.12)',
        border: '1px solid rgba(255, 198, 54, 0.5)',
        color: 'var(--hud-accent)',
      }}
    >
      Variant
    </span>
  );
}
