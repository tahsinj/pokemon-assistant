/**
 * Data packs (trained models and other downloads) from this repo's GitHub
 * Releases. A manifest lists each pack with its size and SHA-256; packs are
 * downloaded into user data, checked against the manifest, and kept, so the
 * app works offline with whatever it downloaded last. The manifest is
 * fetched at most once a day.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const MANIFEST_URL = 'https://github.com/tahsinj/pokemon-assistant/releases/download/packs/packs.json';
const DAY = 24 * 60 * 60 * 1000;

export interface PackEntry {
  /** "matchup-gen9ou" */
  name: string;
  kind: 'model' | 'usage' | 'sets';
  format?: string;
  version: string;
  /** File name next to the manifest. */
  file: string;
  size: number;
  sha256: string;
}

export interface Manifest {
  generated: string;
  packs: PackEntry[];
}

interface State {
  checkedAt: number;
  manifest: Manifest | null;
}

export interface PackStatus {
  checkedAt: number;
  packs: { name: string; version: string; have: boolean }[];
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

function writeAtomic(file: string, bytes: Buffer | string): void {
  const tmp = `${file}.part`;
  writeFileSync(tmp, bytes);
  renameSync(tmp, file);
}

export class PackStore {
  private state: State;
  private refreshing: Promise<void> | null = null;

  constructor(
    private readonly dir: string,
    private readonly fetchImpl: Fetch,
    private readonly manifestUrl: string = MANIFEST_URL,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dir, { recursive: true });
    try {
      this.state = JSON.parse(readFileSync(path.join(dir, 'state.json'), 'utf8')) as State;
    } catch {
      this.state = { checkedAt: 0, manifest: null };
    }
  }

  private file(entry: PackEntry): string {
    return path.join(this.dir, path.basename(entry.file));
  }

  private valid(entry: PackEntry): Buffer | null {
    try {
      const bytes = readFileSync(this.file(entry));
      return bytes.length === entry.size && sha256(bytes) === entry.sha256 ? bytes : null;
    } catch {
      return null;
    }
  }

  /** Fetch the manifest and any pack that is missing or changed. Quiet when offline. */
  refresh(force = false): Promise<void> {
    if (!force && this.state.checkedAt && this.now() - this.state.checkedAt < DAY) return Promise.resolve();
    this.refreshing ??= this.download().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async download(): Promise<void> {
    let manifest: Manifest;
    try {
      const res = await this.fetchImpl(this.manifestUrl);
      if (!res.ok) return;
      manifest = JSON.parse(Buffer.from(await res.arrayBuffer()).toString('utf8')) as Manifest;
    } catch {
      return;
    }
    for (const entry of manifest.packs) {
      if (this.valid(entry)) continue;
      try {
        const res = await this.fetchImpl(new URL(entry.file, this.manifestUrl).toString());
        if (!res.ok) continue;
        const bytes = Buffer.from(await res.arrayBuffer());
        // A pack that doesn't match the manifest is never kept.
        if (bytes.length === entry.size && sha256(bytes) === entry.sha256) writeAtomic(this.file(entry), bytes);
      } catch {
        // Offline or interrupted: the previous copy, if any, stays.
      }
    }
    // A pack whose new version failed to download keeps its last good version.
    const previous = this.state.manifest?.packs ?? [];
    const packs = manifest.packs.map((entry) => {
      if (this.valid(entry)) return entry;
      const old = previous.find((p) => p.name === entry.name);
      return old && this.valid(old) ? old : entry;
    });
    this.state = { checkedAt: this.now(), manifest: { generated: manifest.generated, packs } };
    writeAtomic(path.join(this.dir, 'state.json'), JSON.stringify(this.state));
  }

  /** A pack's bytes, or null when it hasn't been downloaded (or doesn't verify). */
  get(name: string): Buffer | null {
    const entry = this.state.manifest?.packs.find((p) => p.name === name);
    return entry ? this.valid(entry) : null;
  }

  status(): PackStatus {
    return {
      checkedAt: this.state.checkedAt,
      packs: (this.state.manifest?.packs ?? []).map((p) => ({ name: p.name, version: p.version, have: !!this.valid(p) })),
    };
  }
}
