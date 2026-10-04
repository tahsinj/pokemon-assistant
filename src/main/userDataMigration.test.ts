import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DB_FILE, findLegacyUserData, MARKER, renameLegacyDb } from './userDataMigration';

let appData: string;
let current: string;

function seed(name: string, mtimeSec?: number): string {
  const dir = path.join(appData, name);
  mkdirSync(dir, { recursive: true });
  const db = path.join(dir, MARKER);
  writeFileSync(db, '');
  if (mtimeSec != null) utimesSync(db, mtimeSec, mtimeSec);
  return dir;
}

beforeEach(() => {
  appData = mkdtempSync(path.join(tmpdir(), 'userdata-'));
  current = path.join(appData, 'STAB Lab');
});

afterEach(() => rmSync(appData, { recursive: true, force: true }));

describe('findLegacyUserData', () => {
  it('returns null on a fresh install', () => {
    expect(findLegacyUserData(appData, current)).toBeNull();
  });

  it('finds the folder from the previous name', () => {
    const old = seed('Pokemon Assistant');
    expect(findLegacyUserData(appData, current)).toBe(old);
  });

  it('prefers the most recently written database', () => {
    seed('cobblemon-assistant', 1_000);
    const newer = seed('pokemon-assistant', 2_000);
    seed('Pokemon Assistant', 1_500);
    expect(findLegacyUserData(appData, current)).toBe(newer);
  });

  it('does nothing once the current folder has a database', () => {
    seed('STAB Lab');
    seed('pokemon-assistant');
    expect(findLegacyUserData(appData, current)).toBeNull();
  });

  it('ignores old folders without a database', () => {
    mkdirSync(path.join(appData, 'pokemon-assistant'));
    expect(findLegacyUserData(appData, current)).toBeNull();
  });
});

describe('renameLegacyDb', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'stablab-db-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('renames the old database file', () => {
    writeFileSync(path.join(dir, MARKER), 'old');
    expect(renameLegacyDb(dir)).toBe(true);
    expect(readFileSync(path.join(dir, DB_FILE), 'utf8')).toBe('old');
    expect(existsSync(path.join(dir, MARKER))).toBe(false);
  });

  it('keeps an existing database under the new name', () => {
    writeFileSync(path.join(dir, MARKER), 'old');
    writeFileSync(path.join(dir, DB_FILE), 'new');
    expect(renameLegacyDb(dir)).toBe(false);
    expect(readFileSync(path.join(dir, DB_FILE), 'utf8')).toBe('new');
  });

  it('does nothing on a fresh install', () => {
    expect(renameLegacyDb(dir)).toBe(false);
  });
});

describe('findLegacyUserData after the rename', () => {
  it('does nothing once the current folder has a database under the new name', () => {
    const appData = mkdtempSync(path.join(tmpdir(), 'stablab-appdata-'));
    const current = path.join(appData, 'STAB Lab');
    mkdirSync(current);
    writeFileSync(path.join(current, DB_FILE), 'x');
    const old = path.join(appData, 'pokemon-assistant');
    mkdirSync(old);
    writeFileSync(path.join(old, MARKER), 'y');
    expect(findLegacyUserData(appData, current)).toBeNull();
    rmSync(appData, { recursive: true, force: true });
  });
});
