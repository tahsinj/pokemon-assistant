-- Cobblemon Rivals Assistant - local SQLite schema (sql.js / file-backed).
-- Users: reserved for multi-profile / sync later; single implicit user for now.

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL DEFAULT 'Untitled',
  riven_tag TEXT NOT NULL DEFAULT 'general',
  showdown_export TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  species_id TEXT,
  species_display TEXT NOT NULL DEFAULT '',
  item TEXT,
  ability TEXT,
  nature TEXT,
  evs_json TEXT,
  moves_json TEXT,
  PRIMARY KEY (team_id, slot),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teams_updated ON teams(updated_at DESC);

-- Spawn cache: optional future use for Rivals-specific overrides / reverse biome index.
CREATE TABLE IF NOT EXISTS spawn_index (
  species_id TEXT NOT NULL,
  biome_tag TEXT NOT NULL,
  bucket TEXT,
  weight REAL,
  time_bucket TEXT,
  weather TEXT,
  context TEXT,
  raw_json TEXT,
  PRIMARY KEY (species_id, biome_tag, time_bucket, weather)
);

CREATE INDEX IF NOT EXISTS idx_spawn_biome ON spawn_index(biome_tag);
