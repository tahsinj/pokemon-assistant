import { createRequire } from 'node:module';
import type { Database, SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { applySchema, columnNames, userVersion } from './dbSchema';

const require = createRequire(import.meta.url);
let SQL: SqlJsStatic;

beforeAll(async () => {
  const initSqlJs = require('sql.js/dist/sql-asm.js') as () => Promise<SqlJsStatic>;
  SQL = await initSqlJs();
});

function tableNames(db: Database): string[] {
  const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name");
  const names: string[] = [];
  while (stmt.step()) names.push(String(stmt.getAsObject().name));
  stmt.free();
  return names;
}

describe('applySchema', () => {
  it('creates a fresh database with the tag column', () => {
    const db = new SQL.Database();
    applySchema(db);
    expect(columnNames(db, 'teams')).toContain('tag');
    expect(columnNames(db, 'teams')).not.toContain('riven_tag');
    expect(tableNames(db)).toEqual(['pc_boxes', 'pc_pokemon', 'team_members', 'teams']);
  });

  it('renames riven_tag on an old database and keeps the data', () => {
    const db = new SQL.Database();
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL DEFAULT 'Untitled',
        riven_tag TEXT NOT NULL DEFAULT 'general',
        showdown_export TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE team_members (
        team_id TEXT NOT NULL,
        slot INTEGER NOT NULL,
        species_id TEXT,
        species_display TEXT NOT NULL DEFAULT '',
        item TEXT,
        ability TEXT,
        nature TEXT,
        evs_json TEXT,
        moves_json TEXT,
        PRIMARY KEY (team_id, slot)
      );
      CREATE TABLE spawn_index (species_id TEXT, biome_tag TEXT);
    `);
    db.run("INSERT INTO teams (id, name, riven_tag, updated_at) VALUES ('t1', 'Rain', 'raid', 1)");

    applySchema(db);

    const stmt = db.prepare('SELECT name, tag FROM teams WHERE id = ?');
    stmt.bind(['t1']);
    expect(stmt.step()).toBe(true);
    expect(stmt.getAsObject()).toEqual({ name: 'Rain', tag: 'raid' });
    stmt.free();
    expect(columnNames(db, 'team_members')).toEqual(
      expect.arrayContaining(['level', 'ivs_json']),
    );
    expect(tableNames(db)).not.toContain('spawn_index');
  });

  it('rewrites saved species ids to Showdown ids once', () => {
    const db = new SQL.Database();
    applySchema(db);
    db.run('PRAGMA user_version = 0');
    db.run("INSERT INTO pc_boxes (id, name, sort_order, updated_at) VALUES ('b', 'Box', 0, 1)");
    const insertMon = (id: string, slot: number, species: string) =>
      db.run(
        `INSERT INTO pc_pokemon (id, box_id, slot, species_id, species_display, ivs_json, evs_json, moves_json, updated_at)
         VALUES (?, 'b', ?, ?, ?, '{}', '{}', '[]', 1)`,
        [id, slot, species, species],
      );
    insertMon('a', 0, 'great tusk');
    insertMon('b', 1, 'mr. mime');
    insertMon('c', 2, 'garchomp');
    db.run("INSERT INTO teams (id, name, updated_at) VALUES ('t', 'Team', 1)");
    db.run("INSERT INTO team_members (team_id, slot, species_id) VALUES ('t', 0, 'greninjaash')");

    applySchema(db);

    const ids = (sql: string) => {
      const stmt = db.prepare(sql);
      const out: string[] = [];
      while (stmt.step()) out.push(String(stmt.getAsObject().species_id));
      stmt.free();
      return out;
    };
    expect(ids('SELECT species_id FROM pc_pokemon ORDER BY slot')).toEqual(['greattusk', 'mrmime', 'garchomp']);
    expect(ids('SELECT species_id FROM team_members')).toEqual(['greninjabond']);
    expect(userVersion(db)).toBe(1);
  });

  it('marks a fresh database as current', () => {
    const db = new SQL.Database();
    applySchema(db);
    expect(userVersion(db)).toBe(1);
  });

  it('is safe to run twice', () => {
    const db = new SQL.Database();
    applySchema(db);
    expect(() => applySchema(db)).not.toThrow();
    expect(columnNames(db, 'teams').filter((c) => c === 'tag')).toHaveLength(1);
  });
});
