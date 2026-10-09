/**
 * Raid planner: pick a boss and the raid's rules, and see which Pokémon in
 * your box can take it on, with the moves and items that would help. The
 * ranking is a quick calc estimate; the best few can be simulated.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Move, Pokemon } from '../lib/types';
import type { SmogonBundle } from '../lib/smogon';
import { usePcCollection } from '../lib/usePcCollection';
import { boxCandidates, targetSpec, type CheckCandidate } from '../lib/checks';
import { quickEstimate, raidUpgrades, RAID_PRESETS, type BoostStat, type RaidEstimate, type RaidPreset, type RaidRules } from '../lib/raid';
import { packSpecs } from '../engine/verify';
import { runVerify, type VerifyProgress } from '../engine/verifyClient';
import { ModuleFrame, SectionHead } from '../components/hud/ModuleFrame';
import { Segmented } from '../components/hud/Segmented';
import { SpeciesList } from '../components/SpeciesList';
import { PokemonSprite } from '../components/PokemonSprite';

const SIMULATED = 5;
const RAIDS_EACH = 20;
const STATS: BoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABEL: Record<BoostStat, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };

interface Row extends CheckCandidate {
  est: RaidEstimate;
  bestMoves: string[];
  tips: string[];
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-1.5 font-sans text-[14px] text-ink-2">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
        className="w-16"
      />
    </label>
  );
}

export function RaidPage({ pokemon, moves, smogon }: { pokemon: Pokemon[]; moves: Record<string, Move>; smogon: SmogonBundle | null }) {
  const pc = usePcCollection();
  const pokemonById = useMemo(() => Object.fromEntries(pokemon.map((p) => [p.id, p])) as Record<string, Pokemon>, [pokemon]);
  const [boss, setBoss] = useState<Pokemon | null>(null);
  const [preset, setPreset] = useState<RaidPreset | 'custom'>('normal');
  const [rules, setRules] = useState<RaidRules>(RAID_PRESETS.normal);
  const [sims, setSims] = useState<Record<string, VerifyProgress>>({});
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  const edit = (over: Partial<RaidRules>) => {
    setPreset('custom');
    setRules((r) => ({ ...r, ...over }));
  };
  const choosePreset = (p: RaidPreset | 'custom') => {
    setPreset(p);
    if (p !== 'custom') setRules({ ...RAID_PRESETS[p], bossLevel: rules.bossLevel });
  };

  const bossSpec = useMemo(() => (boss ? targetSpec(boss, rules.bossLevel, smogon, moves) : null), [boss, rules.bossLevel, smogon, moves]);

  const rows = useMemo<Row[]>(() => {
    if (!boss || !bossSpec) return [];
    return boxCandidates(pc.mons, pokemonById, moves, (id) => pc.boxNameById[id] ?? 'Box')
      .map((c) => ({
        ...c,
        est: quickEstimate(c.spec, c.p.baseStats, bossSpec, boss.baseStats, rules),
        ...raidUpgrades(c.spec, c.p, moves, bossSpec, boss.baseStats, rules),
      }))
      .sort((a, b) => a.est.estimator - b.est.estimator)
      .slice(0, 20);
  }, [boss, bossSpec, pc.mons, pc.boxNameById, pokemonById, moves, rules]);

  useEffect(() => {
    stop.current?.();
    setSims({});
  }, [rows]);

  // One member at a time, so each gets the workers to itself.
  const simulate = () => {
    if (!bossSpec) return;
    stop.current?.();
    const queue = rows.slice(0, SIMULATED);
    const bossTeam = packSpecs([{ ...bossSpec, level: rules.bossLevel }]);
    let stopped = false;
    const next = (i: number) => {
      if (stopped || i >= queue.length) return;
      const r = queue[i];
      const stopOne = runVerify({ kind: 'raid', member: packSpecs([r.spec]), boss: bossTeam, rules }, RAIDS_EACH, (p) => {
        setSims((s) => ({ ...s, [r.key]: p }));
        if (p.games >= p.total || p.error) next(i + 1);
      });
      stop.current = () => {
        stopped = true;
        stopOne();
      };
    };
    setSims({});
    next(0);
  };

  if (!boss) {
    return (
      <ModuleFrame subtitle="Pick the raid boss">
        <div className="h-[60vh] min-h-[320px] glass rounded-[12px] p-2">
          <SpeciesList pokemon={pokemon} onSelect={setBoss} />
        </div>
      </ModuleFrame>
    );
  }

  return (
    <ModuleFrame
      subtitle={`${boss.name} raid: who in your box can take it on`}
      side={
        <button type="button" className="chunky ghost font-display text-[12px]" style={{ padding: '6px 12px' }} onClick={() => setBoss(null)}>
          ANOTHER BOSS
        </button>
      }
    >
      <div data-ui="raid-rules" className="glass rounded-[14px] p-3.5 mb-4 flex flex-col gap-3 hud-form">
        <div className="flex flex-wrap items-center gap-3">
          <PokemonSprite dex={boss.dex} name={boss.name} size="xs" />
          <span className="font-display text-[16px] font-semibold text-ink-0">{boss.name}</span>
          <Segmented
            value={preset}
            onChange={choosePreset}
            options={[
              { id: 'normal', label: 'Normal' },
              { id: 'tough', label: 'Tough' },
              { id: 'brutal', label: 'Brutal' },
              { id: 'custom', label: 'Custom' },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <NumberField label="Level" value={rules.bossLevel} min={1} max={100} onChange={(n) => edit({ bossLevel: Math.round(n) })} />
          <NumberField label="HP x" value={rules.hpMultiplier} min={1} max={30} step={0.5} onChange={(n) => edit({ hpMultiplier: n })} />
          <NumberField label="Actions per turn" value={rules.bossActionsPerTurn} min={1} max={2} onChange={(n) => edit({ bossActionsPerTurn: Math.round(n) })} />
          <NumberField label="Turn limit" value={rules.turnLimit} min={1} max={50} onChange={(n) => edit({ turnLimit: Math.round(n) })} />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {STATS.map((s) => (
            <NumberField
              key={s}
              label={`${STAT_LABEL[s]} boost`}
              value={rules.statBoosts[s] ?? 0}
              min={-6}
              max={6}
              onChange={(n) => edit({ statBoosts: { ...rules.statBoosts, [s]: Math.round(n) } })}
            />
          ))}
        </div>
      </div>

      <div data-ui="raid" className="mono-panel rounded-[12px] p-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionHead label="Counters" extra={`${rows.length} best of your box`} />
          <button type="button" className="chunky font-display text-[12px]" style={{ padding: '6px 14px' }} onClick={simulate} disabled={!rows.length}>
            {`SIMULATE TOP ${SIMULATED}`}
          </button>
        </div>
        {!rows.length && <p className="font-sans text-[14px] text-ink-2 m-0">{pc.loading ? 'Loading your box...' : 'No Pokémon in your box yet.'}</p>}
        {rows.map((r, i) => {
          const sim = sims[r.key];
          return (
            <div key={r.key} data-ui="species-row" className="flex flex-col gap-1 px-3 py-2 rounded-[10px] border border-white/10 bg-white/[.04]">
              <div className="flex items-center gap-3">
                <span className="font-display text-[15px] font-bold text-accent w-6">{i + 1}</span>
                <PokemonSprite dex={r.p.dex} name={r.p.name} size="xs" />
                <div className="flex-1 min-w-0">
                  <div data-ui="species-name" className="font-display text-[15px] font-semibold text-ink-0">
                    {r.label}
                  </div>
                  <div className="font-sans text-[13px] text-ink-2">{r.sub}</div>
                </div>
                <span className="font-sans text-[14px] text-ink-1 text-right">
                  {r.est.moveName ?? 'no damaging move'}: {pct(r.est.dealt)} a hit
                  <br />
                  takes {pct(r.est.taken)} a turn{r.est.faster ? ', moves first' : ''}
                </span>
                <span className={`font-mono-hud text-[16px] w-20 text-right ${r.est.solo ? 'text-accent-2' : 'text-ink-1'}`} title="How many of this Pokémon it takes; under 1 means it can win alone">
                  {Number.isFinite(r.est.estimator) ? r.est.estimator.toFixed(2) : 'no'}
                  {r.est.solo ? ' solo' : ''}
                </span>
              </div>
              <div className="font-sans text-[13px] text-ink-2 pl-9">
                Best moves here: {r.bestMoves.join(', ') || 'none'}
                {r.tips.length ? `. ${r.tips.join('. ')}.` : '.'}
                {sim && !sim.error && sim.games > 0 && ` Simulated: wins ${pct(sim.score / sim.games)} of ${sim.games}${sim.games < sim.total ? '...' : '.'}`}
                {sim?.error && ` ${sim.error}`}
              </div>
            </div>
          );
        })}
        <p className="font-sans text-[13px] text-ink-2 m-0">
          The estimator is how many of that Pokémon it takes to win: its damage before it faints against the boss's HP. Under 1 means one can win alone within the turn limit. Simulated raids apply the HP multiplier and boosts; extra boss actions count only in the estimate.
        </p>
      </div>
    </ModuleFrame>
  );
}
