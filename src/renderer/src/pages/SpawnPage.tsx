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

const BUCKET_COLORS: Record<string, string> = {
  common: 'var(--ok)',
  uncommon: 'var(--warn)',
  rare: 'var(--accent)',
  'ultra-rare': 'var(--accent-alt-2)',
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
    <div>
      <h1 className="page-title">Spawn Locations</h1>
      <p className="page-sub">
        Biome tags, time, weather, rarity, and rough context (surface / water / cave hints from presets). Data comes
        from bundled spawn JSON - replace via <code style={{ fontSize: 12 }}>scripts/spawn-parser.mjs</code> when you
        have Rivals datapack exports.
      </p>
      <div className="page-grid">
        <div className="panel">
          <SpeciesList pokemon={pokemon} selectedId={selected?.id} onSelect={setSelected} />
        </div>
        <div className="panel">
          {selected && (
            <>
              <h3 style={{ marginTop: 0, fontSize: '1.2rem', fontWeight: 650 }}>{selected.name}</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, fontSize: 12 }}>
                <label>
                  Rarity{' '}
                  <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
                    <option value="">Any</option>
                    <option value="common">common</option>
                    <option value="uncommon">uncommon</option>
                    <option value="rare">rare</option>
                    <option value="ultra-rare">ultra-rare</option>
                  </select>
                </label>
                <label>
                  Time hint{' '}
                  <select value={timeF} onChange={(e) => setTimeF(e.target.value as SpawnTimeBucket | 'any')}>
                    <option value="any">Any</option>
                    <option value="day">Day</option>
                    <option value="night">Night</option>
                    <option value="dawn">Dawn</option>
                    <option value="dusk">Dusk</option>
                  </select>
                </label>
                <label>
                  Weather{' '}
                  <select value={weatherF} onChange={(e) => setWeatherF(e.target.value as SpawnWeather | 'any')}>
                    <option value="any">Any</option>
                    <option value="clear">Clear</option>
                    <option value="rain">Rain</option>
                    <option value="storm">Storm</option>
                  </select>
                </label>
                <label>
                  Context{' '}
                  <select value={contextF} onChange={(e) => setContextF(e.target.value as SpawnContext | 'any')}>
                    <option value="any">Any</option>
                    <option value="surface">Surface</option>
                    <option value="water">Water / fishing</option>
                    <option value="underground">Underground / cave</option>
                    <option value="fishing">Fishing preset</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
              </div>
              {entries.length === 0 ? (
                <div style={{ color: 'var(--fg-dim)' }}>No spawn entries found - may be evolution-only or Rivals custom spawn.</div>
              ) : filteredEntries.length === 0 ? (
                <div style={{ color: 'var(--fg-dim)' }}>No entries match these filters.</div>
              ) : (
                filteredEntries.map((s, i) => (
                  <div key={i} style={{ background: 'var(--bg-3)', padding: 12, borderRadius: 6, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                      <strong style={{ color: BUCKET_COLORS[s.bucket || ''] || 'var(--fg)' }}>
                        {s.bucket || 'unknown'}
                      </strong>
                      <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>
                        Lv {s.level || '?'} · weight {s.weight ?? '?'}
                        {' · '}
                        <span className="pill">{inferWeather(s)}</span>
                        <span className="pill">{inferTimeBucket(s)}</span>
                        <span className="pill">{inferSpawnContext(s)}</span>
                      </span>
                    </div>
                    {s.biomes.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>BIOMES: </span>
                        {s.biomes.map((b) => <span key={b} className="pill">{b.replace('#cobblemon:', '').replace('is_', '')}</span>)}
                      </div>
                    )}
                    {formatCondition(s).length > 0 && (
                      <div>
                        <span style={{ fontSize: 10, color: 'var(--fg-dim)' }}>CONDITIONS: </span>
                        {formatCondition(s).map((c, ci) => (
                          <span key={`${i}-cond-${ci}-${c}`} className="pill">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
