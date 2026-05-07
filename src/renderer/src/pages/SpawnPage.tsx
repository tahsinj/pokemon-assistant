import { useMemo, useState } from 'react';
import type { Pokemon, SpawnEntry } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import {
  inferSpawnContext,
  inferTimeBucket,
  inferWeather,
  matchesSpawnFilters,
  type SpawnContext,
  type SpawnFilters,
  type SpawnTimeBucket,
  type SpawnWeather,
} from '../lib/spawnQuery';
import { ModuleFrame } from '../components/hud/ModuleFrame';

/** Atlas card gradient base per rarity bucket (design SpawnModule palette). */
const BUCKET_COLORS: Record<string, string> = {
  common: '#5ea7ff',
  uncommon: '#ffd34d',
  rare: '#ff7a59',
  'ultra-rare': '#ffa6c8',
};

function formatCondition(s: SpawnEntry): string[] {
  const out: string[] = [];
  if (s.timeRange) out.push(`time: ${s.timeRange}`);
  if (s.isThundering) out.push('thunderstorm');
  else if (s.isRaining) out.push('rain');
  if (s.canSeeSky === true) out.push('open sky');
  if (s.canSeeSky === false) out.push('enclosed');
  if (s.minSkyLight !== undefined || s.maxSkyLight !== undefined) {
    out.push(`light ${s.minSkyLight ?? 0}-${s.maxSkyLight ?? 15}`);
  }
  if (s.moonPhase) out.push(`moon ${s.moonPhase}`);
  if (s.structures?.length) out.push(`structure: ${s.structures.join(',')}`);
  return out;
}

function HudSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex items-center gap-1.5 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-2)]">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-black/40 border border-white/15 rounded-full px-2.5 py-1 font-mono-hud text-[13px] uppercase tracking-wider text-[var(--ink-1)] outline-none focus:border-[var(--hud-accent-2)]"
      >
        {options.map(([v, lbl]) => (
          <option key={v} value={v}>
            {lbl}
          </option>
        ))}
      </select>
    </label>
  );
}

function CondPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 text-[var(--hud-accent-2)]">
      {children}
    </span>
  );
}

export function SpawnPage({
  pokemon,
  spawns,
}: { pokemon: Pokemon[]; spawns: Record<string, SpawnEntry[]> }) {
  const [selected, setSelected] = useState<Pokemon | null>(pokemon[0] || null);
  const [bucket, setBucket] = useState('');
  const [timeF, setTimeF] = useState<SpawnTimeBucket | 'any'>('any');
  const [weatherF, setWeatherF] = useState<SpawnWeather | 'any'>('any');
  const [contextF, setContextF] = useState<SpawnContext | 'any'>('any');

  const entries = selected ? spawns[selected.id] || [] : [];
  const totalRules = useMemo(
    () => Object.values(spawns).reduce((a, b) => a + b.length, 0),
    [spawns],
  );

  const filters: SpawnFilters = useMemo(
    () => ({
      bucket: bucket || undefined,
      time: timeF,
      weather: weatherF,
      context: contextF,
    }),
    [bucket, timeF, weatherF, contextF],
  );

  const filteredEntries = useMemo(
    () => entries.filter((e) => matchesSpawnFilters(e, filters)),
    [entries, filters],
  );

  return (
    <ModuleFrame
      kicker="◢ SPAWN LOCATIONS"
      title="Biome Atlas"
      subtitle={`${totalRules} active spawn rules`}
      side={
        selected && (
          <div className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-[var(--ink-1)]">
            {selected.name.toUpperCase()} · {filteredEntries.length}/{entries.length} RULES
          </div>
        )
      }
    >
      <div className="grid grid-cols-[minmax(260px,340px),1fr] gap-5 items-start">
        <div className="h-[62vh] min-h-[320px] overflow-hidden">
          <SpeciesList pokemon={pokemon} selectedId={selected?.id} onSelect={setSelected} />
        </div>

        <div className="min-w-0">
          {selected && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <HudSelect
                  label="Rarity"
                  value={bucket}
                  onChange={setBucket}
                  options={[
                    ['', 'Any'],
                    ['common', 'common'],
                    ['uncommon', 'uncommon'],
                    ['rare', 'rare'],
                    ['ultra-rare', 'ultra-rare'],
                  ]}
                />
                <HudSelect
                  label="Time"
                  value={timeF}
                  onChange={(v) => setTimeF(v as SpawnTimeBucket | 'any')}
                  options={[
                    ['any', 'Any'],
                    ['day', 'Day'],
                    ['night', 'Night'],
                    ['dawn', 'Dawn'],
                    ['dusk', 'Dusk'],
                  ]}
                />
                <HudSelect
                  label="Weather"
                  value={weatherF}
                  onChange={(v) => setWeatherF(v as SpawnWeather | 'any')}
                  options={[
                    ['any', 'Any'],
                    ['clear', 'Clear'],
                    ['rain', 'Rain'],
                    ['storm', 'Storm'],
                  ]}
                />
                <HudSelect
                  label="Context"
                  value={contextF}
                  onChange={(v) => setContextF(v as SpawnContext | 'any')}
                  options={[
                    ['any', 'Any'],
                    ['surface', 'Surface'],
                    ['water', 'Water / fishing'],
                    ['underground', 'Underground / cave'],
                    ['fishing', 'Fishing preset'],
                    ['unknown', 'Unknown'],
                  ]}
                />
              </div>

              {entries.length === 0 ? (
                <div className="font-mono-hud text-[15px] text-[var(--ink-2)] px-2 py-6 text-center">
                  No spawn entries found - may be evolution-only or a custom spawn.
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="font-mono-hud text-[15px] text-[var(--ink-2)] px-2 py-6 text-center">
                  No entries match these filters.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[54vh] overflow-y-auto pr-1 no-scrollbar">
                  {filteredEntries.map((s, i) => {
                    const color = BUCKET_COLORS[s.bucket || ''] || '#8a9aa6';
                    return (
                      <div
                        key={i}
                        className="relative rounded-[14px] overflow-hidden border border-white/10 group"
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `linear-gradient(160deg, ${color}, #08131c 80%)`,
                            opacity: 0.7,
                          }}
                        />
                        <div className="absolute inset-0 stripes opacity-[.4]" />
                        <div className="relative p-4">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-display text-[16px] font-bold text-white">
                              Lv {s.level || '?'}{' '}
                              <span className="font-mono-hud text-[13px] text-white/70">
                                · weight {s.weight ?? '?'}
                              </span>
                            </div>
                            <span
                              className="font-mono-hud text-[12px] uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: 'rgba(0,0,0,.5)', color }}
                            >
                              {s.bucket || 'unknown'}
                            </span>
                          </div>
                          <div className="font-mono-hud text-[13px] uppercase tracking-wider text-white/70 mt-0.5">
                            {inferWeather(s)} · {inferTimeBucket(s)} · {inferSpawnContext(s)}
                          </div>
                          {s.biomes.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1">
                              {s.biomes.map((b) => (
                                <CondPill key={b}>
                                  {b.replace('#cobblemon:', '').replace('is_', '')}
                                </CondPill>
                              ))}
                            </div>
                          )}
                          {formatCondition(s).length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {formatCondition(s).map((c, ci) => (
                                <CondPill key={`${i}-cond-${ci}-${c}`}>{c}</CondPill>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ModuleFrame>
  );
}
