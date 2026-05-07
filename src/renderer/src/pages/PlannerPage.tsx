import { useMemo, useState } from 'react';
import type { Pokemon, BaseStats, StatKey } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import { NATURES, calcAllStats, STAT_LABELS } from '../lib/stats';
import { ModuleFrame, SpriteFrame } from '../components/hud/ModuleFrame';

const ZERO: BaseStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const MAX_IVS: BaseStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ORDER: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

const PRESETS: Record<string, { nature: string; evs: BaseStats; note: string }> = {
  'Physical Sweeper': {
    nature: 'Jolly',
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    note: 'Max Atk + Spe, Jolly for speed tie advantage. Classic sweeper.',
  },
  'Physical Sweeper (Adamant)': {
    nature: 'Adamant',
    evs: { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 },
    note: 'Max Atk + Spe, Adamant trades outspeed for more damage.',
  },
  'Special Sweeper': {
    nature: 'Timid',
    evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    note: 'Max SpA + Spe, Timid for speed tie advantage.',
  },
  'Special Sweeper (Modest)': {
    nature: 'Modest',
    evs: { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 },
    note: 'Modest trades outspeed for more nuke power.',
  },
  'Physical Wall': {
    nature: 'Impish',
    evs: { hp: 252, atk: 0, def: 252, spa: 0, spd: 4, spe: 0 },
    note: 'Max HP + Def, Impish. Eats physical hits.',
  },
  'Special Wall': {
    nature: 'Calm',
    evs: { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 },
    note: 'Max HP + SpD, Calm. Sponges special attackers.',
  },
  'Bulky Attacker': {
    nature: 'Adamant',
    evs: { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 },
    note: 'Max HP + Atk. Trade speed for bulk and damage.',
  },
};

export function PlannerPage({ pokemon }: { pokemon: Pokemon[] }) {
  const [species, setSpecies] = useState<Pokemon | null>(pokemon[0] || null);
  const [level, setLevel] = useState(50);
  const [nature, setNature] = useState('Hardy');
  const [evs, setEvs] = useState<BaseStats>(ZERO);
  const [ivs, setIvs] = useState<BaseStats>(MAX_IVS);

  const evTotal = ORDER.reduce((a, k) => a + evs[k], 0);
  const perfectIvs = ORDER.filter((k) => ivs[k] === 31).length;
  const computed = useMemo(
    () => (species ? calcAllStats(species.baseStats, ivs, evs, level, nature) : null),
    [species, ivs, evs, level, nature],
  );

  const setEv = (k: StatKey, v: number) => {
    const clamped = Math.max(0, Math.min(252, v));
    const others = ORDER.filter((o) => o !== k).reduce((a, o) => a + evs[o], 0);
    const final = Math.min(clamped, 510 - others);
    setEvs({ ...evs, [k]: final });
  };
  const setIv = (k: StatKey, v: number) => setIvs({ ...ivs, [k]: Math.max(0, Math.min(31, v)) });

  const applyPreset = (name: string) => {
    const p = PRESETS[name];
    setNature(p.nature);
    setEvs(p.evs);
    setIvs(MAX_IVS);
  };

  return (
    <ModuleFrame
      kicker="◢ EV / IV PLANNER"
      title="Stat Sculptor"
      subtitle={species ? `${species.name} · ${nature} · LV ${level}` : 'Pick a species'}
      side={
        <div
          className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px]"
          style={{ color: evTotal > 510 ? 'var(--hud-danger)' : 'var(--ink-1)' }}
        >
          EV {evTotal}/510 · IV 31×{perfectIvs}
        </div>
      }
    >
      <div className="grid grid-cols-[minmax(250px,310px),200px,1fr] gap-5 items-start">
        <div className="h-[62vh] min-h-[320px] overflow-hidden">
          <SpeciesList pokemon={pokemon} selectedId={species?.id} onSelect={setSpecies} />
        </div>

        {species && computed && (
          <>
            {/* Holo sprite + level/nature controls */}
            <div className="flex flex-col gap-2.5">
              <SpriteFrame dex={species.dex} name={species.name} />
              <label className="flex items-center justify-between gap-2 font-mono-hud text-[14px] uppercase tracking-wider text-[var(--ink-2)]">
                Level
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={level}
                  onChange={(e) => setLevel(+e.target.value || 1)}
                  className="w-16 bg-black/40 border border-white/15 rounded-full px-2.5 py-1 font-mono-hud text-[15px] text-white text-right outline-none focus:border-[var(--hud-accent-2)]"
                />
              </label>
              <label className="flex items-center justify-between gap-2 font-mono-hud text-[14px] uppercase tracking-wider text-[var(--ink-2)]">
                Nature
                <select
                  value={nature}
                  onChange={(e) => setNature(e.target.value)}
                  className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-full px-2.5 py-1 font-mono-hud text-[14px] text-[var(--ink-0)] outline-none focus:border-[var(--hud-accent-2)]"
                >
                  {Object.entries(NATURES).map(([n, v]) => (
                    <option key={n} value={n}>
                      {n}
                      {v.plus ? ` (+${STAT_LABELS[v.plus]} −${STAT_LABELS[v.minus!]})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mono-panel p-2.5 rounded-[8px] font-mono-hud text-[13px] text-[var(--ink-1)] leading-snug">
                EV YIELD ·{' '}
                <span className="text-white">
                  {Object.entries(species.evYield || {})
                    .filter(([, v]) => v)
                    .map(([k, v]) => `+${v} ${k}`)
                    .join(', ') || 'none'}
                </span>
              </div>
            </div>

            {/* Stat sculptor rows */}
            <div className="flex flex-col gap-2.5 min-w-0">
              {evTotal > 510 && (
                <div
                  role="status"
                  className="font-mono-hud text-[14px] uppercase tracking-wider px-3 py-1.5 rounded-[8px]"
                  style={{
                    color: 'var(--hud-danger)',
                    background: 'rgba(255,91,108,.10)',
                    border: '1px solid rgba(255,91,108,.4)',
                  }}
                >
                  Total EVs exceed 510 - trim values.
                </div>
              )}
              <div className="grid grid-cols-[44px,44px,56px,1fr,64px,110px] items-center gap-3 font-mono-hud text-[12px] uppercase tracking-wider text-[var(--ink-2)] px-0.5">
                <span>Stat</span>
                <span>Base</span>
                <span>IV</span>
                <span>EV</span>
                <span />
                <span className="text-right">Final</span>
              </div>
              {ORDER.map((k) => {
                const ev = evs[k];
                const final = computed[k];
                const natureMod =
                  NATURES[nature]?.plus === k ? '+' : NATURES[nature]?.minus === k ? '−' : '';
                return (
                  <div
                    key={k}
                    className="grid grid-cols-[44px,44px,56px,1fr,64px,110px] items-center gap-3"
                  >
                    <div className="font-mono-hud text-[14px] uppercase text-[var(--ink-1)]">
                      {STAT_LABELS[k]}
                    </div>
                    <div className="font-mono-hud text-[15px] text-white">
                      {species.baseStats[k]}
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={31}
                      value={ivs[k]}
                      onChange={(e) => setIv(k, +e.target.value)}
                      aria-label={`${STAT_LABELS[k]} IV`}
                      className="w-full bg-black/40 border border-white/15 rounded-[8px] px-1.5 py-0.5 font-mono-hud text-[14px] text-[var(--ink-0)] text-right outline-none focus:border-[var(--hud-accent-2)]"
                    />
                    <input
                      type="range"
                      min={0}
                      max={252}
                      step={4}
                      value={ev}
                      onChange={(e) => setEv(k, +e.target.value)}
                      aria-label={`${STAT_LABELS[k]} EV`}
                      className="ev-slider w-full"
                      style={{
                        background: `linear-gradient(90deg, var(--hud-accent) 0%, var(--hud-accent-2) ${(ev / 252) * 100}%, rgba(255,255,255,.08) ${(ev / 252) * 100}%)`,
                      }}
                    />
                    <div className="font-mono-hud text-[14px] text-[var(--hud-accent-2)] text-right">
                      {ev} EV
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 flex-1 rounded-full bg-black/40 overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${Math.min(100, (final / 400) * 100)}%`,
                            background: 'var(--hud-accent)',
                          }}
                        />
                      </div>
                      <div
                        className="font-mono-hud text-[16px] w-10 text-right"
                        style={{
                          color:
                            natureMod === '+'
                              ? '#7cd87b'
                              : natureMod === '−'
                                ? 'var(--hud-danger)'
                                : 'var(--ink-0)',
                        }}
                        title={natureMod ? `${nature} nature ${natureMod}10%` : undefined}
                      >
                        {final}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Presets */}
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(PRESETS).map(([name, p]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyPreset(name)}
                    title={p.note}
                    className="chunky ghost font-display text-[12px]"
                    style={{ padding: '8px 10px' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </ModuleFrame>
  );
}
