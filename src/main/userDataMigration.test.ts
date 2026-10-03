import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findLegacyUserData, MARKER } from './userDataMigration';

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
