import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import { topCounters } from '../lib/recommender';
import { topPcCounters } from '../lib/pcCounters';
import { usePcCollection } from '../lib/usePcCollection';
import { effectiveness } from '../lib/typechart';
import { TypeChip } from './hud/HudPrimitives';
import { PokemonSprite } from './PokemonSprite';

interface CounterRow {
  key: string;
  p: Pokemon;
  label: string;
  sub: string | null;
  score: number;
}

/**
 * Ranked "best answers" to a fixed target species - the threat-matrix that used
 * to be its own Counter page, folded into the Pokédex detail. The viewed
 * species IS the target, so there's no target picker; otherwise it keeps the
 * All-species / My-PC toggle and the level-aware PC ranking.
 */
export function SpeciesCounters({
  target,
  allPokemon,
  moves,
}: {
  target: Pokemon;
  allPokemon: Pokemon[];
  moves: Record<string, Move>;
}) {
  const [source, setSource] = useState<'dex' | 'pc'>('dex');
  const [targetLevel, setTargetLevel] = useState(50);
  const pc = usePcCollection();

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of allPokemon) m[p.id] = p;
    return m;
  }, [allPokemon]);

  const dexRows = useMemo<CounterRow[]>(() => {
    if (source !== 'dex') return [];
    return topCounters(target, allPokemon, moves, 15).map(({ p, score }) => ({
      key: p.id,
      p,
      label: p.name,
      sub: null,
      score,
    }));
  }, [target, source, allPokemon, moves]);

  const pcOutcome = useMemo(() => {
    if (source !== 'pc') return null;
    return topPcCounters(target, pc.mons, pokemonById, moves, { targetLevel });
  }, [target, source, pc.mons, pokemonById, moves, targetLevel]);

  const pcRows = useMemo<CounterRow[]>(() => {
    if (!pcOutcome) return [];
    return pcOutcome.results.map(({ rec, p, score }) => ({
      key: rec.id,
      p,
      label: rec.nickname || p.name,
      sub: `Lv ${rec.level} · ${pc.boxNameById[rec.boxId] ?? 'Box'}`,
      score,
    }));
  }, [pcOutcome, pc.boxNameById]);

  const rows = source === 'pc' ? pcRows : dexRows;
  const maxScore = rows[0]?.score || 1;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <div className="hud-mark font-mono-hud text-[14px] uppercase tracking-widest text-accent-2">
          BEST ANSWERS → {target.name.toUpperCase()}
        </div>
        {pc.available && (
          <div className="flex items-center gap-1 mono-panel rounded-full p-0.5 ml-auto">
            {(['dex', 'pc'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSource(s)}
                className={`font-mono-hud text-[14px] uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${
                  source === s
                    ? 'bg-accent-2 text-black'
                    : 'text-ink-2 hover:text-ink-1'
                }`}
              >
                {s === 'dex' ? 'All species' : `My PC · ${pc.mons.length}`}
              </button>
            ))}
          </div>
        )}
        {source === 'pc' && (
          <label className="flex items-center gap-1.5 font-mono-hud text-[14px] uppercase tracking-wider text-ink-2">
            Threat lv
            <input
              type="number"
              min={1}
              max={100}
              value={targetLevel}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setTargetLevel(Math.max(1, Math.min(100, Math.round(v))));
              }}
              className="w-16 bg-black/40 border border-white/15 rounded-full px-2.5 py-1 font-mono-hud text-[14px] text-ink-1 outline-none focus:border-accent-2"
            />
          </label>
        )}
      </div>

      {source === 'pc' && rows.length === 0 ? (
        <div className="font-mono-hud text-[15px] text-ink-2 px-2 py-6 text-center">
          {pc.loading
            ? 'Loading PC…'
            : pc.mons.length === 0
              ? 'No Pokémon stored in the PC yet.'
              : `Nothing in the PC is ready for a level ${targetLevel} ${target.name}${
                  pcOutcome && pcOutcome.underleveled > 0
                    ? ` - ${pcOutcome.underleveled} too underleveled`
                    : ''
                }.`}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto pr-1 no-scrollbar">
            {rows.map(({ key, p, label, sub, score }, i) => {
              const attackTypes = p.types.filter((t) => effectiveness(t, target.types) > 1);
              const hint = `${
                attackTypes.length
                  ? `Hits ${target.name} super-effectively with STAB ${attackTypes.join('/')}. `
                  : ''
              }Speed ${p.baseStats.spe} vs ${target.baseStats.spe}.`;
              return (
                <div
                  key={key}
                  title={hint}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04] hover:bg-white/[.07] transition group"
                >
                  <div className="font-display text-[15px] font-bold text-accent w-6">
                    {i + 1}
                  </div>
                  <PokemonSprite dex={p.dex} name={p.name} size="xs" />
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-[15px] font-semibold truncate text-ink-0">
                      {label}
                    </div>
                    {sub && (
                      <div className="font-mono-hud text-[14px] uppercase tracking-wider text-ink-2 truncate">
                        {sub}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {p.types.map((t) => (
                      <TypeChip key={t} t={t.toLowerCase()} />
                    ))}
                  </div>
                  <div className="relative h-2 w-32 rounded-full bg-black/40 overflow-hidden flex-shrink-0">
                    <div
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${(score / maxScore) * 100}%`,
                        background: 'linear-gradient(90deg, var(--hud-accent), var(--hud-accent-2))',
                      }}
                    />
                  </div>
                  <div className="font-mono-hud text-[16px] text-accent-2 w-12 text-right flex-shrink-0">
                    {score.toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
          {source === 'pc' && pcOutcome && pcOutcome.underleveled > 0 && (
            <div className="font-mono-hud text-[14px] text-ink-2 mt-2">
              › {pcOutcome.underleveled} PC Pokémon hidden - too underleveled for a level {targetLevel} threat (below{' '}
              {Math.ceil(targetLevel * 0.6)}).
            </div>
          )}
        </>
      )}
    </div>
  );
}
