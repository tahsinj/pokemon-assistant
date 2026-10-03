import { useMemo, useState } from 'react';
import type { Pokemon, SpawnEntry } from '../lib/types';
import { SpeciesList } from '../components/SpeciesList';
import {
  biomeLabel,
  inferSpawnContext,
  inferTimeBucket,
  inferWeather,
  listBiomes,
  matchesSpawnFilters,
  speciesInBiome,
  type SpawnContext,
  type SpawnFilters,
  type SpawnTimeBucket,
  type SpawnWeather,
} from '../lib/spawnQuery';
import { ModuleFrame } from '../components/hud/ModuleFrame';
import { PokemonSprite } from '../components/PokemonSprite';

/** Rarest first for the biome reverse-search results. */
const BUCKET_RANK: Record<string, number> = {
  'ultra-rare': 0,
  rare: 1,
  uncommon: 2,
  common: 3,
};

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
  const [mode, setMode] = useState<'species' | 'biome'>('species');
  const [bucket, setBucket] = useState('');
  const [biomeF, setBiomeF] = useState('');
  const [timeF, setTimeF] = useState<SpawnTimeBucket | 'any'>('any');
  const [weatherF, setWeatherF] = useState<SpawnWeather | 'any'>('any');
  const [contextF, setContextF] = useState<SpawnContext | 'any'>('any');

  const entries = useMemo(() => (selected ? spawns[selected.id] || [] : []), [selected, spawns]);
  const totalRules = useMemo(
    () => Object.values(spawns).reduce((a, b) => a + b.length, 0),
    [spawns],
  );

  const pokemonById = useMemo(() => {
    const m: Record<string, Pokemon> = {};
    for (const p of pokemon) m[p.id] = p;
    return m;
  }, [pokemon]);

  const biomes = useMemo(() => listBiomes(spawns), [spawns]);

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

  const biomeHits = useMemo(() => {
    if (mode !== 'biome' || !biomeF) return [];
    return speciesInBiome(spawns, biomeF, filters)
      .map((h) => ({ ...h, p: pokemonById[h.speciesId] }))
      .filter((h): h is typeof h & { p: Pokemon } => !!h.p)
      .sort((a, b) => {
        const ra = Math.min(...a.entries.map((e) => BUCKET_RANK[e.bucket || ''] ?? 4));
        const rb = Math.min(...b.entries.map((e) => BUCKET_RANK[e.bucket || ''] ?? 4));
        return ra !== rb ? ra - rb : a.p.name.localeCompare(b.p.name);
      });
  }, [mode, biomeF, spawns, filters, pokemonById]);

  const sharedFilters = (
    <>
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
    </>
  );

  const modeToggle = (
    <div className="flex items-center gap-1 mono-panel rounded-full p-0.5">
      {(['species', 'biome'] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`font-mono-hud text-[12px] uppercase tracking-wider px-3 py-1 rounded-full transition-colors ${
            mode === m
              ? 'bg-[var(--hud-accent-2)] text-black'
              : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
          }`}
        >
          By {m}
        </button>
      ))}
    </div>
  );

  return (
    <ModuleFrame
      kicker="SPAWN LOCATIONS"
      title="Biome Atlas"
      subtitle={`${totalRules} active spawn rules`}
      side={
        mode === 'biome' ? (
          biomeF && (
            <div className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-[var(--ink-1)]">
              {biomeLabel(biomeF).toUpperCase()} · {biomeHits.length} SPECIES
            </div>
          )
        ) : (
          selected && (
            <div className="mono-panel px-3 py-1 rounded-full font-mono-hud text-[14px] text-[var(--ink-1)]">
              {selected.name.toUpperCase()} · {filteredEntries.length}/{entries.length} RULES
            </div>
          )
        )
      }
    >
      {mode === 'biome' ? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            {modeToggle}
            <HudSelect
              label="Biome"
              value={biomeF}
              onChange={setBiomeF}
              options={[['', 'Choose…'], ...biomes.map((b): [string, string] => [b, biomeLabel(b)])]}
            />
            {sharedFilters}
          </div>

          {!biomeF ? (
            <div className="font-mono-hud text-[15px] text-[var(--ink-2)] px-2 py-6 text-center">
              Pick a biome to see everything that spawns there.
            </div>
          ) : biomeHits.length === 0 ? (
            <div className="font-mono-hud text-[15px] text-[var(--ink-2)] px-2 py-6 text-center">
              Nothing spawns here with these filters.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 max-h-[62vh] overflow-y-auto pr-1 no-scrollbar">
              {biomeHits.map(({ p, entries: hitEntries }) => {
                const best = hitEntries.reduce((a, b) =>
                  (BUCKET_RANK[a.bucket || ''] ?? 4) <= (BUCKET_RANK[b.bucket || ''] ?? 4) ? a : b,
                );
                const color = BUCKET_COLORS[best.bucket || ''] || '#8a9aa6';
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelected(p);
                      setMode('species');
                    }}
                    className="relative rounded-[14px] overflow-hidden border border-white/10 text-left group"
                    title={`Open ${p.name} in species view`}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(160deg, ${color}, #08131c 80%)`,
                        opacity: 0.7,
                      }}
                    />
                    <div className="absolute inset-0 stripes opacity-[.4]" />
                    <div className="relative p-3 flex items-center gap-3">
                      <PokemonSprite dex={p.dex} name={p.name} size="sm" />
                      <div className="min-w-0">
                        <div className="font-display text-[15px] font-bold text-white truncate">
                          {p.name}
                        </div>
                        <div className="font-mono-hud text-[12px] uppercase tracking-wider text-white/70">
                          {hitEntries.length} rule{hitEntries.length > 1 ? 's' : ''} · lv{' '}
                          {best.level || '?'}
                        </div>
                      </div>
                      <span
                        className="ml-auto font-mono-hud text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: 'rgba(0,0,0,.5)', color }}
                      >
                        {best.bucket || 'unknown'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <div className="grid grid-cols-[minmax(260px,340px),1fr] gap-5 items-start">
        <div className="h-[62vh] min-h-[320px] overflow-hidden">
          <SpeciesList pokemon={pokemon} selectedId={selected?.id} onSelect={setSelected} />
        </div>

        <div className="min-w-0">
          {selected && (
            <>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {modeToggle}
                {sharedFilters}
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
      )}
    </ModuleFrame>
  );
}
