import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { app } from 'electron';
import type { Database, SqlJsStatic } from 'sql.js';

// ASM build avoids bundling sql-wasm.wasm into the Electron package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const initSqlJs = require('sql.js/dist/sql-asm.js') as (config?: {
  locateFile?: (file: string) => string;
}) => Promise<SqlJsStatic>;

let db: Database | null = null;

function dbPath() {
  return path.join(app.getPath('userData'), 'rivals-assistant.sqlite');
}

function persist() {
  if (!db) return;
  const dir = path.dirname(dbPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath(), Buffer.from(db.export()));
}

export async function initRivalsDb(): Promise<void> {
  const SQL = await initSqlJs();
  const file = dbPath();
  if (fs.existsSync(file)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  } else {
    db = new SQL.Database();
  }
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_teams_updated ON teams(updated_at);
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
  `);
  // Migrations for DBs created before a column existed. ALTER TABLE ADD COLUMN
  // throws if the column already exists, so each is isolated in try/catch.
  try {
    db.run('ALTER TABLE pc_pokemon ADD COLUMN shiny INTEGER NOT NULL DEFAULT 0');
  } catch {
    /* column already present */
  }
  ensureDefaultPcBox();
  persist();
}

function ensureDefaultPcBox(): void {
  if (!db) return;
  const c = db.prepare('SELECT COUNT(*) AS n FROM pc_boxes');
  c.step();
  const n = Number(c.getAsObject().n);
  c.free();
  if (n > 0) return;
  const id = randomUUID();
  const now = Date.now();
  db.run('INSERT INTO pc_boxes (id, name, sort_order, updated_at) VALUES (?, ?, 0, ?)', [
    id,
    'Box 01',
    now,
  ]);
}

export interface TeamMemberRow {
  slot: number;
  speciesId: string | null;
  speciesDisplay: string;
  item: string | null;
  ability: string | null;
  nature: string | null;
  evs: Record<string, number> | null;
  moves: string[] | null;
}

export interface TeamRecord {
  id: string;
  name: string;
  rivenTag: string;
  showdownExport: string | null;
  updatedAt: number;
  members: TeamMemberRow[];
}

export interface SaveTeamPayload {
  id?: string;
  name: string;
  rivenTag: string;
  showdownExport?: string | null;
  members: TeamMemberRow[];
}

export function listTeams(): Pick<TeamRecord, 'id' | 'name' | 'rivenTag' | 'updatedAt'>[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT id, name, riven_tag, updated_at FROM teams ORDER BY updated_at DESC');
  const out: Pick<TeamRecord, 'id' | 'name' | 'rivenTag' | 'updatedAt'>[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    out.push({
      id: String(r.id),
      name: String(r.name),
      rivenTag: String(r.riven_tag),
      updatedAt: Number(r.updated_at),
    });
  }
  stmt.free();
  return out;
}

export function loadTeam(id: string): TeamRecord | null {
  if (!db) return null;
  const t = db.prepare('SELECT id, name, riven_tag, showdown_export, updated_at FROM teams WHERE id = ?');
  t.bind([id]);
  if (!t.step()) {
    t.free();
    return null;
  }
  const head = t.getAsObject();
  t.free();

  const m = db.prepare(
    'SELECT slot, species_id, species_display, item, ability, nature, evs_json, moves_json FROM team_members WHERE team_id = ? ORDER BY slot',
  );
  m.bind([id]);
  const members: TeamMemberRow[] = [];
  while (m.step()) {
    const r = m.getAsObject();
    let evs: Record<string, number> | null = null;
    let moves: string[] | null = null;
    try {
      if (r.evs_json) evs = JSON.parse(String(r.evs_json)) as Record<string, number>;
    } catch {
      /* ignore */
    }
    try {
      if (r.moves_json) moves = JSON.parse(String(r.moves_json)) as string[];
    } catch {
      /* ignore */
    }
    members.push({
      slot: Number(r.slot),
      speciesId: r.species_id ? String(r.species_id) : null,
      speciesDisplay: String(r.species_display || ''),
      item: r.item ? String(r.item) : null,
      ability: r.ability ? String(r.ability) : null,
      nature: r.nature ? String(r.nature) : null,
      evs,
      moves,
    });
  }
  m.free();

  return {
    id: String(head.id),
    name: String(head.name),
    rivenTag: String(head.riven_tag),
    showdownExport: head.showdown_export != null ? String(head.showdown_export) : null,
    updatedAt: Number(head.updated_at),
    members,
  };
}

export function saveTeam(payload: SaveTeamPayload): { id: string } {
  if (!db) throw new Error('Database not initialized');
  const id = payload.id || randomUUID();
  const now = Date.now();
  const exportText = payload.showdownExport ?? null;

  db.run('BEGIN');
  try {
    db.run('DELETE FROM team_members WHERE team_id = ?', [id]);
    db.run('DELETE FROM teams WHERE id = ?', [id]);
    db.run(
      'INSERT INTO teams (id, name, riven_tag, showdown_export, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, payload.name, payload.rivenTag, exportText, now],
    );
    const ins = db.prepare(
      `INSERT INTO team_members (team_id, slot, species_id, species_display, item, ability, nature, evs_json, moves_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const mem of payload.members) {
      ins.run([
        id,
        mem.slot,
        mem.speciesId,
        mem.speciesDisplay,
        mem.item,
        mem.ability,
        mem.nature,
        mem.evs ? JSON.stringify(mem.evs) : null,
        mem.moves ? JSON.stringify(mem.moves) : null,
      ]);
    }
    ins.free();
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  persist();
  return { id };
}

export function deleteTeam(id: string): void {
  if (!db) return;
  db.run('DELETE FROM teams WHERE id = ?', [id]);
  persist();
}

// ---------------------------------------------------------------------------
// PC storage
// ---------------------------------------------------------------------------

export type PcGender = 'male' | 'female' | 'genderless';

export interface PcStatSpread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface PcPokemonRow {
  id: string;
  boxId: string;
  slot: number;
  speciesId: string;
  speciesDisplay: string;
  nickname: string | null;
  level: number;
  gender: PcGender;
  nature: string;
  ability: string;
  item: string | null;
  ivs: PcStatSpread;
  evs: PcStatSpread;
  moves: string[];
  notes: string | null;
  shiny: boolean;
  updatedAt: number;
}

export interface PcBoxRow {
  id: string;
  name: string;
  sortOrder: number;
  updatedAt: number;
}

export interface SavePcPokemonPayload {
  id?: string;
  boxId: string;
  slot: number;
  speciesId: string;
  speciesDisplay: string;
  nickname?: string | null;
  level: number;
  gender: PcGender;
  nature: string;
  ability: string;
  item?: string | null;
  ivs: PcStatSpread;
  evs: PcStatSpread;
  moves: string[];
  notes?: string | null;
  shiny?: boolean;
}

function parseStatJson(raw: unknown, fallback: PcStatSpread): PcStatSpread {
  if (!raw) return fallback;
  try {
    const o = JSON.parse(String(raw)) as Partial<PcStatSpread>;
    return {
      hp: Number(o.hp ?? fallback.hp),
      atk: Number(o.atk ?? fallback.atk),
      def: Number(o.def ?? fallback.def),
      spa: Number(o.spa ?? fallback.spa),
      spd: Number(o.spd ?? fallback.spd),
      spe: Number(o.spe ?? fallback.spe),
    };
  } catch {
    return fallback;
  }
}

const DEFAULT_STATS: PcStatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_STATS: PcStatSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function rowToPcPokemon(r: Record<string, unknown>): PcPokemonRow {
  let moves: string[] = [];
  try {
    if (r.moves_json) moves = JSON.parse(String(r.moves_json)) as string[];
  } catch {
    /* ignore */
  }
  return {
    id: String(r.id),
    boxId: String(r.box_id),
    slot: Number(r.slot),
    speciesId: String(r.species_id),
    speciesDisplay: String(r.species_display),
    nickname: r.nickname != null ? String(r.nickname) : null,
    level: Number(r.level),
    gender: (String(r.gender) as PcGender) || 'genderless',
    nature: String(r.nature),
    ability: String(r.ability),
    item: r.item != null ? String(r.item) : null,
    ivs: parseStatJson(r.ivs_json, DEFAULT_STATS),
    evs: parseStatJson(r.evs_json, ZERO_STATS),
    moves,
    notes: r.notes != null ? String(r.notes) : null,
    shiny: Number(r.shiny) === 1,
    updatedAt: Number(r.updated_at),
  };
}

export function listPcBoxes(): PcBoxRow[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT id, name, sort_order, updated_at FROM pc_boxes ORDER BY sort_order, name');
  const out: PcBoxRow[] = [];
  while (stmt.step()) {
    const r = stmt.getAsObject();
    out.push({
      id: String(r.id),
      name: String(r.name),
      sortOrder: Number(r.sort_order),
      updatedAt: Number(r.updated_at),
    });
  }
  stmt.free();
  return out;
}

export function createPcBox(name: string): PcBoxRow {
  if (!db) throw new Error('Database not initialized');
  const id = randomUUID();
  const now = Date.now();
  const boxes = listPcBoxes();
  const sortOrder = boxes.length;
  const label = name.trim() || `Box ${String(sortOrder + 1).padStart(2, '0')}`;
  db.run('INSERT INTO pc_boxes (id, name, sort_order, updated_at) VALUES (?, ?, ?, ?)', [
    id,
    label,
    sortOrder,
    now,
  ]);
  persist();
  return { id, name: label, sortOrder, updatedAt: now };
}

export function renamePcBox(id: string, name: string): void {
  if (!db) return;
  db.run('UPDATE pc_boxes SET name = ?, updated_at = ? WHERE id = ?', [name.trim() || 'Box', Date.now(), id]);
  persist();
}

export function deletePcBox(id: string): void {
  if (!db) return;
  db.run('DELETE FROM pc_boxes WHERE id = ?', [id]);
  persist();
  ensureDefaultPcBox();
}

export function listPcPokemon(boxId: string): PcPokemonRow[] {
  if (!db) return [];
  const stmt = db.prepare(
    `SELECT id, box_id, slot, species_id, species_display, nickname, level, gender, nature, ability, item,
            ivs_json, evs_json, moves_json, notes, shiny, updated_at
     FROM pc_pokemon WHERE box_id = ? ORDER BY slot`,
  );
  stmt.bind([boxId]);
  const out: PcPokemonRow[] = [];
  while (stmt.step()) {
    out.push(rowToPcPokemon(stmt.getAsObject() as Record<string, unknown>));
  }
  stmt.free();
  return out;
}

export function savePcPokemon(payload: SavePcPokemonPayload): { id: string } {
  if (!db) throw new Error('Database not initialized');
  const id = payload.id || randomUUID();
  const now = Date.now();
  const slot = Math.max(0, Math.min(29, payload.slot));
  const moves = payload.moves.filter((m) => m.trim()).slice(0, 4);

  db.run('BEGIN');
  try {
    db.run('DELETE FROM pc_pokemon WHERE box_id = ? AND slot = ? AND id != ?', [
      payload.boxId,
      slot,
      id,
    ]);
    db.run(
      `INSERT OR REPLACE INTO pc_pokemon (
        id, box_id, slot, species_id, species_display, nickname, level, gender, nature, ability, item,
        ivs_json, evs_json, moves_json, notes, shiny, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        payload.boxId,
        slot,
        payload.speciesId,
        payload.speciesDisplay,
        payload.nickname ?? null,
        payload.level,
        payload.gender,
        payload.nature,
        payload.ability,
        payload.item ?? null,
        JSON.stringify(payload.ivs),
        JSON.stringify(payload.evs),
        JSON.stringify(moves),
        payload.notes ?? null,
        payload.shiny ? 1 : 0,
        now,
      ],
    );
    db.run('UPDATE pc_boxes SET updated_at = ? WHERE id = ?', [now, payload.boxId]);
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  persist();
  return { id };
}

export function deletePcPokemon(id: string): void {
  if (!db) return;
  const row = db.prepare('SELECT box_id FROM pc_pokemon WHERE id = ?');
  row.bind([id]);
  let boxId: string | null = null;
  if (row.step()) boxId = String(row.getAsObject().box_id);
  row.free();
  db.run('DELETE FROM pc_pokemon WHERE id = ?', [id]);
  if (boxId) db.run('UPDATE pc_boxes SET updated_at = ? WHERE id = ?', [Date.now(), boxId]);
  persist();
}

function getPcPokemonById(id: string): PcPokemonRow | null {
  if (!db) return null;
  const stmt = db.prepare(
    `SELECT id, box_id, slot, species_id, species_display, nickname, level, gender, nature, ability, item,
            ivs_json, evs_json, moves_json, notes, updated_at
     FROM pc_pokemon WHERE id = ?`,
  );
  stmt.bind([id]);
  let row: PcPokemonRow | null = null;
  if (stmt.step()) row = rowToPcPokemon(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return row;
}

function getPcPokemonAtSlot(boxId: string, slot: number): PcPokemonRow | null {
  if (!db) return null;
  const stmt = db.prepare(
    `SELECT id, box_id, slot, species_id, species_display, nickname, level, gender, nature, ability, item,
            ivs_json, evs_json, moves_json, notes, updated_at
     FROM pc_pokemon WHERE box_id = ? AND slot = ?`,
  );
  stmt.bind([boxId, slot]);
  let row: PcPokemonRow | null = null;
  if (stmt.step()) row = rowToPcPokemon(stmt.getAsObject() as Record<string, unknown>);
  stmt.free();
  return row;
}

/** Move (or swap) a Pokémon to another box/slot. */
export function movePcPokemon(pokemonId: string, toBoxId: string, toSlot: number): void {
  if (!db) throw new Error('Database not initialized');
  const src = getPcPokemonById(pokemonId);
  if (!src) throw new Error('Pokémon not found');

  const slot = Math.max(0, Math.min(29, Math.floor(toSlot)));
  if (src.boxId === toBoxId && src.slot === slot) return;

  const now = Date.now();
  const target = getPcPokemonAtSlot(toBoxId, slot);

  db.run('BEGIN');
  try {
    if (target && target.id !== pokemonId) {
      db.run('UPDATE pc_pokemon SET box_id = ?, slot = ?, updated_at = ? WHERE id = ?', [
        src.boxId,
        src.slot,
        now,
        target.id,
      ]);
    }
    db.run('UPDATE pc_pokemon SET box_id = ?, slot = ?, updated_at = ? WHERE id = ?', [
      toBoxId,
      slot,
      now,
      pokemonId,
    ]);
    db.run('UPDATE pc_boxes SET updated_at = ? WHERE id = ?', [now, src.boxId]);
    if (toBoxId !== src.boxId) {
      db.run('UPDATE pc_boxes SET updated_at = ? WHERE id = ?', [now, toBoxId]);
    }
    db.run('COMMIT');
  } catch (e) {
    db.run('ROLLBACK');
    throw e;
  }
  persist();
}
