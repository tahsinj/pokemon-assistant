import { useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { CompetitiveIntel } from './CompetitiveIntel';
import { CoverageThreats } from './CoverageThreats';
import { SpeciesCounters } from './SpeciesCounters';
import { bst } from '../lib/stats';
import { competitiveMoveset, suggestMoveset, tmPriorities } from '../lib/recommender';
import { defensiveProfile } from '../lib/typechart';
import { MoveCard, SpriteFrame } from './hud/ModuleFrame';
import { StatBar, TypeChip } from './hud/HudPrimitives';
import { abilityName } from '../lib/displayNames';

export function PokemonDexDetail({
  p,
  moves,
  smogon,
  allPokemon,
  onSelectSpecies,
}: {
  p: Pokemon;
  moves: Record<string, Move>;
  smogon: SmogonBundle | null;
  /** Full dex list - needed to rank counters in the Counters tab. */
  allPokemon: Pokemon[];
  onSelectSpecies: (id: string) => void;
}) {
  const intel = smogon?.species[p.id] ?? null;
  const [view, setView] = useState<'overview' | 'counters'>('overview');
  const [moveTab, setMoveTab] = useState<'best' | 'levelup' | 'tm'>('best');
  const suggested =
    moveTab === 'tm'
      ? []
      : moveTab === 'best'
        ? competitiveMoveset(p, moves, intel) ?? suggestMoveset(p, moves, { smogon: intel })
        : suggestMoveset(p, moves, { pool: 'levelup', smogon: intel });
  const tms = moveTab === 'tm' ? tmPriorities(p, moves, intel, 8) : [];
  const prof = defensiveProfile(p.types);
  const weaks = Object.entries(prof).filter(([, m]) => m > 1).sort((a, b) => b[1] - a[1]);
  const resists = Object.entries(prof).filter(([, m]) => m < 1 && m > 0).sort((a, b) => a[1] - b[1]);
  const immunes = Object.entries(prof).filter(([, m]) => m === 0);
  const learnable = p.moves
    .map((lm) => ({ learn: lm.learn, mv: moves[lm.move] }))
    .filter((x) => x.mv);

  const tabBar = (
    <div className="flex items-center gap-1 mono-panel rounded-full p-0.5 self-start">
      {(
        [
          ['overview', 'Overview'],
          ['counters', 'Counters'],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          aria-pressed={view === id}
          className={`font-mono-hud text-[13px] uppercase tracking-wider px-4 py-1 rounded-full transition-colors ${
            view === id ? 'bg-accent-2 text-black' : 'text-ink-2 hover:text-ink-1'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  if (view === 'counters') {
    return (
      <div className="flex flex-col gap-4">
        {tabBar}
        <SpeciesCounters target={p} allPokemon={allPokemon} moves={moves} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {tabBar}
      <div className="grid grid-cols-[200px,1fr] gap-5">
        {/* Holo sprite + identity */}
        <div className="flex flex-col gap-2">
          <SpriteFrame dex={p.dex} name={p.name} />
          <div className="font-display text-[17px] font-bold leading-tight text-ink-0">
            {p.name}
          </div>
          <div className="flex gap-1.5">
            {p.types.map((t) => (
              <TypeChip key={t} t={t.toLowerCase()} />
            ))}
          </div>
          <div className="mono-panel p-2.5 rounded-[8px] font-mono-hud text-[14px] text-ink-1">
            BST <span className="text-white">{bst(p.baseStats)}</span> ·{' '}
            {(p.height / 10).toFixed(1)}m · {(p.weight / 10).toFixed(1)}kg
          </div>
        </div>

        {/* Stats + abilities + matchups */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="mono-panel p-3 rounded-[10px]">
            <div className="flex items-center justify-between mb-1.5 font-mono-hud">
              <div className="text-[14px] uppercase tracking-widest text-accent-2">
                BASE STATS
              </div>
              <div className="text-[14px] text-ink-2">BST {bst(p.baseStats)}</div>
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
              <div className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2 mb-1">
                Abilities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {p.abilities
                  .filter((a) => !p.hiddenAbilities.includes(a))
                  .map((a) => (
                    <span
                      key={a}
                      data-ui="ability"
                      className="font-display text-[13px] font-semibold px-2 py-0.5 rounded-full border border-white/15 bg-black/30 text-ink-0"
                    >
                      {abilityName(a)}
                    </span>
                  ))}
                {p.hiddenAbilities.map((a) => (
                  <span
                    key={a}
                    data-ui="ability"
                    title="Hidden ability"
                    className="font-display text-[13px] font-semibold px-2 py-0.5 rounded-full border border-accent/50 bg-black/30 text-accent"
                  >
                    {abilityName(a)} (H)
                  </span>
                ))}
              </div>
            </div>
            <div className="px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]">
              <div className="font-mono-hud text-[12px] uppercase tracking-wider text-ink-2 mb-1">
                Defending
              </div>
              <div className="flex flex-col gap-1 font-mono-hud text-[13px]">
                {weaks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span style={{ color: 'var(--hud-danger)' }}>WEAK</span>
                    {weaks.map(([t, m]) => (
                      <span key={t} className="inline-flex items-center gap-0.5">
                        <TypeChip t={t.toLowerCase()} />
                        <span className="text-ink-2">×{m}</span>
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
                        <span className="text-ink-2">×{m}</span>
                      </span>
                    ))}
                  </div>
                )}
                {immunes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-ink-2">IMMUNE</span>
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

      {/* Coverage & threats - beginner matchup intel from popular movesets */}
      <CoverageThreats
        p={p}
        moves={moves}
        smogon={smogon}
        allPokemon={allPokemon}
        onSelectSpecies={onSelectSpecies}
      />

      {/* Recommended moveset - tabbed: Smogon-blended / level-up only / TM priorities */}
      <div>
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <div className="hud-mark font-mono-hud text-[14px] uppercase tracking-widest text-accent-2">
            RECOMMENDED MOVESET ·{' '}
            <span className="text-ink-2">
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
                    ? 'bg-accent-2 text-black'
                    : 'text-ink-2 hover:text-ink-1'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {moveTab === 'tm' ? (
          tms.length === 0 ? (
            <div className="font-mono-hud text-[14px] text-ink-2 py-4 text-center">
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
                  <span className="font-display text-[14px] font-bold text-accent">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-display text-[14px] font-semibold truncate text-ink-0">
                      {move.name}
                    </div>
                    <div className="font-mono-hud text-[12px] text-ink-2 truncate">
                      {reasons.join(' · ')}
                    </div>
                  </div>
                  <TypeChip t={move.type.toLowerCase()} />
                  <span className="font-mono-hud text-[13px] text-ink-1">
                    PWR {move.power || '-'}
                  </span>
                  <span className="font-mono-hud text-[13px] text-ink-1">{move.category}</span>
                </div>
              ))}
            </div>
          )
        ) : suggested.length === 0 ? (
          <div className="font-mono-hud text-[14px] text-ink-2 py-4 text-center">
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
        <div className="hud-mark font-mono-hud text-[14px] uppercase tracking-widest text-accent-2 mb-2">
          FULL LEARNSET · <span className="text-ink-2">{learnable.length} MOVES</span>
        </div>
        <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
          {learnable.map(({ learn, mv }) => (
            <div
              key={`${learn}-${mv.id}`}
              className="grid grid-cols-[minmax(0,1fr),auto,auto,52px,64px,64px] items-center gap-3 px-3 py-1.5 rounded-[8px] border border-white/5 bg-white/[.03] hover:bg-white/[.06] transition"
              title={mv.desc}
            >
              <div className="font-display text-[14px] font-semibold truncate text-ink-0">{mv.name}</div>
              <span className="font-mono-hud text-[13px] text-ink-2 whitespace-nowrap">{learnLabel(learn)}</span>
              <TypeChip t={mv.type.toLowerCase()} />
              <span className="font-mono-hud text-[13px] text-ink-1">{mv.category[0]}</span>
              <span className="font-mono-hud text-[13px] text-ink-1">
                PWR {mv.power || '-'}
              </span>
              <span className="font-mono-hud text-[13px] text-ink-1">
                ACC {mv.accuracy === true ? '-' : mv.accuracy}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** How a move is learned, as shown in the learnset: "Lv 12", "TM", "Egg", "Past gen". */
function learnLabel(learn: string): string {
  if (/^\d+$/.test(learn)) return `Lv ${learn}`;
  if (learn === 'tm') return 'TM';
  if (learn === 'legacy') return 'Past gen';
  return learn[0].toUpperCase() + learn.slice(1);
}
