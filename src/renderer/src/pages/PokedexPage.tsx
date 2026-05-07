import { useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import { bst } from '../lib/stats';
import { suggestMoveset } from '../lib/recommender';
import { defensiveProfile } from '../lib/typechart';
import { getMergedSpecies } from '../lib/battle/dex';
import { summarizeSpeciesDivergence } from '../lib/battle/overrides';
import { ModuleFrame, MoveCard, SpriteFrame } from '../components/hud/ModuleFrame';
import { StatBar, TypeChip } from '../components/hud/HudPrimitives';

export function PokedexPage({
  pokemon,
  moves,
}: { pokemon: Pokemon[]; moves: Record<string, Move> }) {
  const [selected, setSelected] = useState<Pokemon | null>(pokemon[0] || null);
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
        <div className="min-w-0">{selected && <PokemonDetail p={selected} moves={moves} />}</div>
      </div>
    </ModuleFrame>
  );
}

function PokemonDetail({ p, moves }: { p: Pokemon; moves: Record<string, Move> }) {
  const suggested = suggestMoveset(p, moves);
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

      {/* Recommended moveset */}
      <div>
        <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
          ◢ RECOMMENDED MOVESET ·{' '}
          <span className="text-[var(--ink-2)]">
            STAB + coverage, {p.baseStats.atk >= p.baseStats.spa ? 'physical' : 'special'} bias
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2.5">
          {suggested.map(({ move, reasons }) => (
            <MoveCard key={move.id} m={move} hint={reasons.join(' · ')} />
          ))}
        </div>
      </div>

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
