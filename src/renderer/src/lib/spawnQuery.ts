import type { SpawnEntry } from './types';

export type SpawnWeather = 'clear' | 'rain' | 'storm';
export type SpawnTimeBucket = 'day' | 'night' | 'dawn' | 'dusk' | 'any';
export type SpawnContext = 'water' | 'underground' | 'fishing' | 'surface' | 'unknown';

export function inferWeather(s: SpawnEntry): SpawnWeather {
  if (s.isThundering) return 'storm';
  if (s.isRaining) return 'rain';
  return 'clear';
}

export function inferTimeBucket(s: SpawnEntry): SpawnTimeBucket {
  const tr = (s.timeRange || '').toLowerCase();
  if (!tr) return 'any';
  if (tr.includes('dawn')) return 'dawn';
  if (tr.includes('dusk')) return 'dusk';
  if (tr.includes('night')) return 'night';
  if (tr.includes('day')) return 'day';
  return 'any';
}

export function inferSpawnContext(s: SpawnEntry): SpawnContext {
  const presets = (s.presets || []).join(' ').toLowerCase();
  const biomes = (s.biomes || []).join(' ').toLowerCase();
  if (presets.includes('fish')) return 'fishing';
  if (biomes.includes('river') || biomes.includes('ocean')) return 'water';
  if (presets.includes('cave') || biomes.includes('cave') || biomes.includes('underground')) return 'underground';
  if (presets.includes('surface')) return 'surface';
  if (presets.includes('water')) return 'water';
  return 'unknown';
}

export interface SpawnFilters {
  bucket?: string;
  time?: SpawnTimeBucket | 'any';
  weather?: SpawnWeather | 'any';
  context?: SpawnContext | 'any';
}

export function matchesSpawnFilters(s: SpawnEntry, f: SpawnFilters): boolean {
  if (f.bucket && (s.bucket || '') !== f.bucket) return false;
  if (f.time && f.time !== 'any') {
    const tb = inferTimeBucket(s);
    if (tb !== 'any' && tb !== f.time) return false;
  }
  if (f.weather && f.weather !== 'any' && inferWeather(s) !== f.weather) return false;
  if (f.context && f.context !== 'any' && inferSpawnContext(s) !== f.context) return false;
  return true;
}
