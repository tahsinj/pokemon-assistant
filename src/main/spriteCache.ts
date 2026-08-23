/**
 * Offline sprite cache backed by a custom `cpsprite://` protocol.
 *
 * Pokémon sprite images aren't ours to redistribute, so we don't ship them.
 * Instead the renderer asks for `cpsprite://sprites/<subpath>` (see
 * src/renderer/src/lib/sprites.ts); the main process serves the file from a
 * per-user cache under `<userData>/sprite-cache/` when it exists (the offline
 * path), otherwise fetches it once from the PokeAPI mirror, caches it, and
 * serves it. This is the user's own local cache - exactly like a browser
 * cache, no redistribution. When a sprite is neither cached nor reachable
 * (offline + never viewed) the handler returns 404 and the renderer's fallback
 * chain ends at a glyph placeholder.
 */
import { app, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

const SCHEME = 'cpsprite';
const POKEAPI = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

// Routing + guard in one: only numeric sprite ids, optionally under the
// artwork/shiny subfolders. Rejects path traversal and arbitrary remote URLs.
const SUBPATH_RE = /^(?:other\/official-artwork\/|shiny\/)?\d+\.png$/;

let cacheDir: string | null = null;
const inflight = new Map<string, Promise<Buffer | null>>();

/**
 * Must run before the app `ready` event - standard+secure so the scheme loads
 * as an `<img>` subresource without tripping mixed-content checks.
 */
export function registerSpriteSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true },
    },
  ]);
}

function cachePathFor(subpath: string): string {
  // Flatten the subpath ("other/official-artwork/1.png") into one safe filename.
  return path.join(cacheDir as string, subpath.replace(/\//g, '__'));
}

/** Fetch a sprite from the mirror and write it to the cache. De-duped per subpath. */
async function fetchAndCache(subpath: string): Promise<Buffer | null> {
  const existing = inflight.get(subpath);
  if (existing) return existing;
  const job = (async () => {
    try {
      const res = await fetch(`${POKEAPI}/${subpath}`);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) return null;
      const dest = cachePathFor(subpath);
      const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
      await fsp.writeFile(tmp, buf);
      await fsp.rename(tmp, dest); // atomic publish so readers never see a partial file
      return buf;
    } catch {
      return null; // offline / DNS / reset - caller serves a 404 and the UI falls back
    } finally {
      inflight.delete(subpath);
    }
  })();
  inflight.set(subpath, job);
  return job;
}

function pngResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } });
}

/** Register the protocol handler. Call after the app is ready. */
export function registerSpriteProtocol(): void {
  cacheDir = path.join(app.getPath('userData'), 'sprite-cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  protocol.handle(SCHEME, async (request) => {
    let subpath: string;
    try {
      // cpsprite://sprites/<subpath> - host ("sprites") is ignored; path is the
      // sprite location relative to the PokeAPI pokemon/ folder.
      subpath = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
    } catch {
      return new Response(null, { status: 400 });
    }
    if (!SUBPATH_RE.test(subpath)) return new Response(null, { status: 404 });

    // Cache first - this is what makes the app work offline.
    try {
      return pngResponse(await fsp.readFile(cachePathFor(subpath)));
    } catch {
      /* cache miss -> try the network */
    }

    const fetched = await fetchAndCache(subpath);
    return fetched ? pngResponse(fetched) : new Response(null, { status: 404 });
  });
}
