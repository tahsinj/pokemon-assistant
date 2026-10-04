/**
 * The page's handle on a practice battle. The battle runs in a worker so bot
 * thinking never blocks the UI; if the worker can't start, it runs in this
 * thread instead.
 */
import { PracticeSession, type SessionOptions, type SessionView } from './session';

export type PracticeRequest =
  | { id: number; type: 'start'; options: SessionOptions }
  | { id: number; type: 'choose'; choice: string }
  | { id: number; type: 'undo' }
  | { id: number; type: 'export' };

export type PracticeResponse = { id: number; ok: true; result: SessionView | string } | { id: number; ok: false; error: string };

type Body = PracticeRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

export interface PracticeClient {
  start(options: SessionOptions): Promise<SessionView>;
  choose(choice: string): Promise<SessionView>;
  undo(): Promise<SessionView>;
  exportLog(): Promise<string>;
  dispose(): void;
}

export function createPracticeClient(): PracticeClient {
  let nextId = 1;
  const pending = new Map<number, { body: Body; resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let worker: Worker | null = null;
  let localSession: PracticeSession | null = null;

  const runLocally = async (body: Body): Promise<unknown> => {
    if (body.type === 'start') localSession = new PracticeSession(body.options);
    if (!localSession) throw new Error('No battle is running.');
    if (body.type === 'choose') return localSession.choose(body.choice);
    if (body.type === 'undo') return localSession.undo();
    if (body.type === 'export') return localSession.exportLog();
    return localSession.view();
  };

  const fallBack = () => {
    worker?.terminate();
    worker = null;
    for (const [id, p] of pending) {
      pending.delete(id);
      runLocally(p.body).then(p.resolve, p.reject);
    }
  };

  try {
    worker = new Worker(new URL('./practice.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PracticeResponse>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    };
    worker.onerror = fallBack;
  } catch {
    worker = null;
  }

  const call = <T>(body: Body): Promise<T> => {
    if (!worker) return runLocally(body) as Promise<T>;
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { body, resolve: resolve as (v: unknown) => void, reject });
      worker!.postMessage({ ...body, id } as PracticeRequest);
    });
  };

  return {
    start: (options) => call<SessionView>({ type: 'start', options }),
    choose: (choice) => call<SessionView>({ type: 'choose', choice }),
    undo: () => call<SessionView>({ type: 'undo' }),
    exportLog: () => call<string>({ type: 'export' }),
    dispose: () => worker?.terminate(),
  };
}
