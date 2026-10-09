import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PackStore, type Manifest } from './packs';

const URL_BASE = 'https://example.test/packs/packs.json';
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function server(files: Record<string, Buffer | string>) {
  const calls: string[] = [];
  let online = true;
  const fetch = async (url: string) => {
    calls.push(url);
    if (!online) throw new Error('offline');
    const name = url.split('/').pop()!;
    const body = files[name];
    const bytes = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(body);
    return { ok: body != null, status: body == null ? 404 : 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer };
  };
  return { fetch, calls, files, goOffline: () => (online = false) };
}

function manifest(model: Buffer, version = '1'): string {
  const m: Manifest = {
    generated: '2026-10-09',
    packs: [{ name: 'matchup-gen9ou', kind: 'model', format: 'gen9ou', version, file: `matchup-gen9ou-${version}.onnx`, size: model.length, sha256: sha(model) }],
  };
  return JSON.stringify(m);
}

describe('data packs', () => {
  it('downloads packs, checks them and keeps them', async () => {
    const model = Buffer.from('model v1');
    const s = server({ 'packs.json': manifest(model), 'matchup-gen9ou-1.onnx': model });
    const dir = mkdtempSync(path.join(tmpdir(), 'packs-'));
    let now = 1_000_000;
    const store = new PackStore(dir, s.fetch, URL_BASE, () => now);
    expect(store.get('matchup-gen9ou')).toBeNull();
    await store.refresh();
    expect(store.get('matchup-gen9ou')?.toString()).toBe('model v1');
    expect(store.status().packs).toEqual([{ name: 'matchup-gen9ou', version: '1', have: true }]);

    // At most once a day.
    const before = s.calls.length;
    now += 60_000;
    await store.refresh();
    expect(s.calls.length).toBe(before);

    // A fresh store (next launch) reads what is on disk, offline.
    s.goOffline();
    const again = new PackStore(dir, s.fetch, URL_BASE, () => now);
    expect(again.get('matchup-gen9ou')?.toString()).toBe('model v1');
    await again.refresh(true);
    expect(again.get('matchup-gen9ou')?.toString()).toBe('model v1');
  });

  it('never keeps a download that does not match the manifest, and falls back to the last good one', async () => {
    const v1 = Buffer.from('model v1');
    const s = server({ 'packs.json': manifest(v1), 'matchup-gen9ou-1.onnx': v1 });
    const dir = mkdtempSync(path.join(tmpdir(), 'packs-'));
    let now = 1_000_000;
    const store = new PackStore(dir, s.fetch, URL_BASE, () => now);
    await store.refresh();

    // Version 2 is published, but the file served is corrupt.
    const v2 = Buffer.from('model v2');
    s.files['packs.json'] = manifest(v2, '2');
    s.files['matchup-gen9ou-2.onnx'] = Buffer.from('tampered');
    now += 2 * 24 * 60 * 60 * 1000;
    await store.refresh();
    expect(store.get('matchup-gen9ou')?.toString()).toBe('model v1');
    expect(store.status().packs[0].version).toBe('1');

    // Once the good file is up, it replaces version 1.
    s.files['matchup-gen9ou-2.onnx'] = v2;
    await store.refresh(true);
    expect(store.get('matchup-gen9ou')?.toString()).toBe('model v2');
  });

  it('stays empty when the manifest is missing', async () => {
    const s = server({});
    const store = new PackStore(mkdtempSync(path.join(tmpdir(), 'packs-')), s.fetch, URL_BASE);
    await store.refresh();
    expect(store.status().packs).toEqual([]);
  });
});
