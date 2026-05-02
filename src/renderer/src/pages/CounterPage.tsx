import { useMemo, useState } from 'react';
import type { Pokemon, Move } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import { TypeBadge } from '../components/TypeBadge';
import { topCounters } from '../lib/recommender';
import { effectiveness } from '../lib/typechart';

export function CounterPage({ pokemon, moves }: { pokemon: Pokemon[]; moves: Record<string, Move> }) {
  const [target, setTarget] = useState<Pokemon | null>(pokemon[0] || null);
  const counters = useMemo(
    () => (target ? topCounters(target, pokemon, moves, 15) : []),
    [target, pokemon, moves],
  );

  return (
    <div>
      <h1 className="page-title">Counter Picker</h1>
      <p className="page-sub">Pick the opponent and see species scored to beat them by offensive matchup, bulk, and speed.</p>
      <div className="page-grid">
        <div className="panel">
          <SpeciesList pokemon={pokemon} selectedId={target?.id} onSelect={setTarget} />
        </div>
        <div className="panel">
          {target && (
            <>
              <h3 style={{ marginTop: 0 }}>
                vs {target.name} {target.types.map((t) => <TypeBadge key={t} type={t} />)}
              </h3>
              <div style={{ fontSize: 11, color: 'var(--fg-dim)', marginBottom: 8 }}>
                Score = best offensive move × type effectiveness × STAB × attacker stat, plus defensive resilience and speed.
              </div>
              {counters.map(({ p, score }) => {
                // show the best move type that hits super effective
                const attackTypes = p.types.filter((t) => effectiveness(t, target.types) > 1);
                return (
                  <div key={p.id} className="badge-counter tooltip">
                    <span>
                      <strong>{p.name}</strong> {p.types.map((t) => <TypeBadge key={t} type={t} />)}
                    </span>
                    <span className="score">{score.toFixed(0)}</span>
                    <span className="tip">
                      {attackTypes.length
                        ? `Hits ${target.name} super-effectively with STAB ${attackTypes.join('/')}. `
                        : ''}
                      Speed {p.baseStats.spe} vs {target.baseStats.spe}.
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
