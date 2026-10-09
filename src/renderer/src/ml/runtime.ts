/**
 * The page's handle on downloaded models. Models load lazily, one per tool
 * and format, into a worker. Anything that fails (no pack downloaded yet, no
 * worker, a bad file) resolves to null, and callers fall back to their
 * heuristic.
 */
import type { Feed, MlRequest, MlResponse } from './ml.worker';

export type { Feed };

type Body = MlRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

let worker: Worker | null | undefined;
let nextId = 1;
const pending = new Map<number, { resolve: (r: Float32Array | undefined) => void; reject: (e: Error) => void }>();
const loaded = new Map<string, Promise<boolean>>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./ml.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<MlResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      for (const p of pending.values()) p.reject(new Error('the model worker stopped'));
      pending.clear();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

function call(body: Body, transfer: Transferable[] = []): Promise<Float32Array | undefined> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('no model worker'));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ ...body, id }, transfer);
  });
}

/** Load a model pack once; true when it is ready to run. */
export function loadModel(name: string): Promise<boolean> {
  let p = loaded.get(name);
  if (!p) {
    p = (async () => {
      const bytes = await window.assistant?.packsGet?.(name);
      if (!bytes) return false;
      await call({ type: 'load', name, bytes });
      return true;
    })().catch(() => false);
    loaded.set(name, p);
  }
  return p;
}

/** Win chances for each row of features, or null when the model can't run. */
export async function runModel(name: string, rows: number[][]): Promise<number[] | null> {
  if (!rows.length) return [];
  if (!(await loadModel(name))) return null;
  const cols = rows[0].length;
  const data = new Float32Array(rows.length * cols);
  rows.forEach((r, i) => data.set(r, i * cols));
  try {
    const out = await call({ type: 'run', name, data, rows: rows.length, cols }, [data.buffer]);
    return out ? Array.from(out) : null;
  } catch {
    return null;
  }
}

/** Run a loaded model on named inputs and return one float output, or null when it can't run. */
export async function runFeeds(name: string, feeds: Record<string, Feed>, output: string): Promise<Float32Array | null> {
  if (!(await loadModel(name))) return null;
  try {
    const transfer = Object.values(feeds).map((f) => f.data.buffer);
    return (await call({ type: 'feeds', name, feeds, output }, transfer)) ?? null;
  } catch {
    return null;
  }
}

/** A downloaded JSON pack, parsed, or null when there is none. */
export async function loadJsonPack<T>(name: string): Promise<T | null> {
  try {
    const bytes = await window.assistant?.packsGet?.(name);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as T) : null;
  } catch {
    return null;
  }
}

/** Forget loaded models, so a fresh download is picked up. */
export function resetModels(): void {
  loaded.clear();
}
