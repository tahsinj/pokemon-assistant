import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import { topCounters } from '../lib/recommender';
import { effectiveness } from '../lib/typechart';
import { ModuleFrame, SpriteFrame } from '../components/hud/ModuleFrame';
import { TypeChip } from '../components/hud/HudPrimitives';
import { PokemonSprite } from '../components/PokemonSprite';

export function CounterPage({ pokemon, moves }: { pokemon: Pokemon[]; moves: Record<string, Move> }) {
  const [target, setTarget] = useState<Pokemon | null>(pokemon[0] || null);
  const counters = useMemo(
    () => (target ? topCounters(target, pokemon, moves, 15) : []),
    [target, pokemon, moves],
  );
  const maxScore = counters[0]?.score ?? 1;

  return (
    <ModuleFrame
      kicker="◢ COUNTER PICKER"
      title="Threat Matrix"
      subtitle="STAB × type effectiveness × bulk × speed"
      side={
        target && (
          <div className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-[var(--ink-1)]">
            TARGET · <span style={{ color: 'var(--hud-danger)' }}>{target.name.toUpperCase()}</span>
          </div>
        )
      }
    >
      <div className="grid grid-cols-[minmax(260px,340px),1fr] gap-5 items-start">
        {/* Target picker */}
        <div className="flex flex-col gap-3">
          {target && (
            <SpriteFrame
              dex={target.dex}
              name={target.name}
              corner="TARGET"
              cornerColor="var(--hud-danger)"
            />
          )}
          <div className="h-[34vh] min-h-[220px] overflow-hidden">
            <SpeciesList pokemon={pokemon} selectedId={target?.id} onSelect={setTarget} />
          </div>
        </div>

        {/* Ranked counters */}
        <div className="min-w-0">
          {target && (
            <>
              <div className="font-mono-hud text-[14px] uppercase tracking-widest text-[var(--hud-accent-2)] mb-2">
                ◢ BEST ANSWERS → {target.name.toUpperCase()}
              </div>
              <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto pr-1 no-scrollbar">
                {counters.map(({ p, score }, i) => {
                  const attackTypes = p.types.filter((t) => effectiveness(t, target.types) > 1);
                  const hint = `${
                    attackTypes.length
                      ? `Hits ${target.name} super-effectively with STAB ${attackTypes.join('/')}. `
                      : ''
                  }Speed ${p.baseStats.spe} vs ${target.baseStats.spe}.`;
                  return (
                    <div
                      key={p.id}
                      title={hint}
                      className="flex items-center gap-3 px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04] hover:bg-white/[.07] transition group"
                    >
                      <div className="font-display text-[15px] font-bold text-[var(--hud-accent)] w-6">
                        {i + 1}
                      </div>
                      <PokemonSprite dex={p.dex} name={p.name} size="xs" />
                      <div className="font-display text-[15px] font-semibold flex-1 min-w-0 truncate text-[var(--ink-0)]">
                        {p.name}
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
                            background:
                              'linear-gradient(90deg, var(--hud-accent), var(--hud-accent-2))',
                          }}
                        />
                      </div>
                      <div className="font-mono-hud text-[16px] text-[var(--hud-accent-2)] w-12 text-right flex-shrink-0">
                        {score.toFixed(0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}
