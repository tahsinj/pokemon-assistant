/**
 * Checks: pick a Pokémon and see who beats it one on one, from your box or
 * from the format's most used Pokémon, ranked by win chance.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { useFormat } from '../lib/formats';
import { usePcCollection } from '../lib/usePcCollection';
import { boxCandidates, metaCandidates, targetSpec, type CheckCandidate } from '../lib/checks';
import { takeChecksTarget } from '../lib/checksHandoff';
import { scoreMatchups, type ScoreSource } from '../ml/matchup';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { Segmented } from '../components/hud/Segmented';
import { SpeciesList } from '../components/SpeciesList';
import { PokemonSprite } from '../components/PokemonSprite';
import { TypeChip } from '../components/hud/HudPrimitives';

type Pool = 'box' | 'meta';

interface Row extends CheckCandidate {
  win: number;
}

export function ChecksPage({ pokemon, moves, smogon }: { pokemon: Pokemon[]; moves: Record<string, Move>; smogon: SmogonBundle | null }) {
  const format = useFormat();
  const pc = usePcCollection();
  const pokemonById = useMemo(() => Object.fromEntries(pokemon.map((p) => [p.id, p])) as Record<string, Pokemon>, [pokemon]);
  const [target, setTarget] = useState<Pokemon | null>(() => {
    const id = takeChecksTarget();
    return id ? (pokemon.find((p) => p.id === id) ?? null) : null;
  });
  const [level, setLevel] = useState(100);
  const [pool, setPool] = useState<Pool>(pc.available ? 'box' : 'meta');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<ScoreSource | null>(null);

  useEffect(() => {
    if (!pc.loading && !pc.mons.length) setPool('meta');
  }, [pc.loading, pc.mons.length]);

  const candidates = useMemo(() => {
    if (!target) return [];
    return pool === 'box'
      ? boxCandidates(pc.mons, pokemonById, moves, (id) => pc.boxNameById[id] ?? 'Box')
      : metaCandidates(target, pokemonById, smogon, moves);
  }, [target, pool, pc.mons, pc.boxNameById, pokemonById, smogon, moves]);

  useEffect(() => {
    if (!target) return;
    let live = true;
    setRows(null);
    const them = targetSpec(target, level, smogon, moves);
    void scoreMatchups(format.id, candidates.map((c) => [c.spec, them])).then((scored) => {
      if (!live) return;
      setSource(scored.source);
      setRows(candidates.map((c, i) => ({ ...c, win: scored.win[i] })).sort((a, b) => b.win - a.win).slice(0, 25));
    });
    return () => {
      live = false;
    };
  }, [target, level, candidates, smogon, moves, format.id]);

  if (!target) {
    return (
      <ModuleFrame subtitle="Pick a Pokémon to see who beats it one on one">
        <div className="h-[60vh] min-h-[320px] glass rounded-[12px] p-2">
          <SpeciesList pokemon={pokemon} onSelect={setTarget} />
        </div>
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      subtitle={`Who beats ${target.name} one on one`}
      side={
        <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 12px' }} onClick={() => setTarget(null)}>
          ANOTHER POKÉMON
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-3 mb-3 hud-form">
        <PokemonSprite dex={target.dex} name={target.name} size="xs" />
        <span className="font-display text-[16px] font-semibold text-ink-0">{target.name}</span>
        <label className="flex items-center gap-1.5 font-sans text-[14px] text-ink-2">
          Level
          <input
            type="number"
            min={1}
            max={100}
            value={level}
            onChange={(e) => setLevel(Math.max(1, Math.min(100, Math.round(Number(e.target.value) || 100))))}
            aria-label="Target level"
            className="w-16"
          />
        </label>
        <Segmented
          value={pool}
          onChange={setPool}
          options={[
            { id: 'box', label: `Your box · ${pc.mons.length}` },
            { id: 'meta', label: 'Meta' },
          ]}
        />
      </div>
      <div data-ui="checks" className="mono-panel rounded-[12px] p-3 flex flex-col gap-2">
        <SectionHead label="Checks" extra={rows ? `${rows.length} best of ${candidates.length}` : 'scoring...'} />
        {rows?.length === 0 && (
          <p className="font-sans text-[14px] text-ink-2 m-0">
            {pool === 'box' ? 'No Pokémon in your box yet.' : 'No usage data for this format.'}
          </p>
        )}
        {rows?.map((r, i) => (
          <div key={r.key} data-ui="species-row" className="flex items-center gap-3 px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]">
            <span className="font-display text-[15px] font-bold text-accent w-6">{i + 1}</span>
            <PokemonSprite dex={r.p.dex} name={r.p.name} size="xs" />
            <div className="flex-1 min-w-0">
              <div data-ui="species-name" className="font-display text-[15px] font-semibold text-ink-0">
                {r.label}
              </div>
              <div className="font-sans text-[13px] text-ink-2">{r.sub}</div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {r.p.types.map((t) => (
                <TypeChip key={t} t={t.toLowerCase()} />
              ))}
            </div>
            <div className="relative h-2 w-28 rounded-full bg-black/40 overflow-hidden flex-shrink-0">
              <div className="absolute inset-y-0 left-0 bg-accent-2" style={{ width: `${Math.round(r.win * 100)}%` }} />
            </div>
            <span className="font-mono-hud text-[16px] text-accent-2 w-12 text-right flex-shrink-0">{Math.round(r.win * 100)}%</span>
          </div>
        ))}
        <p data-ui="score-source" className="font-sans text-[13px] text-ink-2 m-0">
          {source === 'model'
            ? `One-on-one win chances from the matchup model, against a typical ${target.name} set.`
            : `Estimated from damage calcs (who KOs first, who is faster) against a typical ${target.name} set; the matchup model is used once it has downloaded.`}
        </p>
      </div>
    </ModuleFrame>
  );
}
