import type { Database } from 'sql.js';
import { toSpeciesId } from '../shared/speciesId';

// Bump with each data migration below; stored in SQLite's user_version.
const SCHEMA_VERSION = 1;

const TABLES = `
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT 'Untitled',
    tag TEXT NOT NULL DEFAULT 'general',
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
    level INTEGER,
    ivs_json TEXT,
    evs_json TEXT,
    moves_json TEXT,
    PRIMARY KEY (team_id, slot),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_teams_updated ON teams(updated_at);
  CREATE TABLE IF NOT EXISTS pc_boxes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT 'Box 01',
    sort_order INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS pc_pokemon (
    id TEXT PRIMARY KEY NOT NULL,
    box_id TEXT NOT NULL,
    slot INTEGER NOT NULL,
    species_id TEXT NOT NULL,
    species_display TEXT NOT NULL,
    nickname TEXT,
    level INTEGER NOT NULL DEFAULT 50,
    gender TEXT NOT NULL DEFAULT 'genderless',
    nature TEXT NOT NULL DEFAULT 'Hardy',
    ability TEXT NOT NULL DEFAULT '',
    item TEXT,
    ivs_json TEXT NOT NULL,
    evs_json TEXT NOT NULL,
    moves_json TEXT NOT NULL,
    notes TEXT,
    shiny INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    UNIQUE (box_id, slot),
    FOREIGN KEY (box_id) REFERENCES pc_boxes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_pc_boxes_sort ON pc_boxes(sort_order);
  CREATE INDEX IF NOT EXISTS idx_pc_pokemon_box ON pc_pokemon(box_id);
`;

export function columnNames(db: Database, table: string): string[] {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  const names: string[] = [];
  while (stmt.step()) names.push(String(stmt.getAsObject().name));
  stmt.free();
  return names;
}

export function userVersion(db: Database): number {
  const stmt = db.prepare('PRAGMA user_version');
  stmt.step();
  const version = Number(stmt.getAsObject().user_version ?? 0);
  stmt.free();
  return version;
}

/** Version 1: saved species ids move from the old dataset's spellings to Showdown ids. */
function normalizeSpeciesIds(db: Database): void {
  for (const table of ['pc_pokemon', 'team_members']) {
    const stmt = db.prepare(`SELECT DISTINCT species_id FROM ${table} WHERE species_id IS NOT NULL`);
    const ids: string[] = [];
    while (stmt.step()) ids.push(String(stmt.getAsObject().species_id));
    stmt.free();
    for (const id of ids) {
      const next = toSpeciesId(id);
      if (next !== id) db.run(`UPDATE ${table} SET species_id = ? WHERE species_id = ?`, [next, id]);
    }
  }
}

function addColumnIfMissing(db: Database, table: string, column: string, definition: string): void {
  if (!columnNames(db, table).includes(column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Create the tables and bring databases written by older builds up to date.
 * Safe to run on every launch.
 */
export function applySchema(db: Database): void {
  // Older builds called this column riven_tag. Rename before CREATE TABLE so a
  // fresh database and an upgraded one end up identical.
  if (columnNames(db, 'teams').includes('riven_tag')) {
    db.run('ALTER TABLE teams RENAME COLUMN riven_tag TO tag');
  }
  db.exec(TABLES);
  addColumnIfMissing(db, 'pc_pokemon', 'shiny', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'team_members', 'level', 'INTEGER');
  addColumnIfMissing(db, 'team_members', 'ivs_json', 'TEXT');
  // Spawn cache table from older builds; nothing ever read it.
  db.run('DROP TABLE IF EXISTS spawn_index');
  if (userVersion(db) < 1) normalizeSpeciesIds(db);
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
