/** Runs ONNX models off the UI thread. See runtime.ts for the other end. */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';

// One thread: threads need SharedArrayBuffer, which a file:// page doesn't get.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: wasmUrl };

import type { Feed } from './feed';

export type MlRequest =
  | { id: number; type: 'load'; name: string; bytes: Uint8Array }
  | { id: number; type: 'run'; name: string; data: Float32Array; rows: number; cols: number }
  | { id: number; type: 'feeds'; name: string; feeds: Record<string, Feed>; output: string };

export type MlResponse = { id: number; ok: true; result?: Float32Array } | { id: number; ok: false; error: string };

const sessions = new Map<string, Promise<ort.InferenceSession>>();

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<MlRequest>) => void) | null;
  postMessage(message: MlResponse): void;
};

scope.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      sessions.set(msg.name, ort.InferenceSession.create(msg.bytes));
      await sessions.get(msg.name);
      scope.postMessage({ id: msg.id, ok: true });
      return;
    }
    const session = await sessions.get(msg.name);
    if (!session) throw new Error(`model ${msg.name} is not loaded`);
    if (msg.type === 'feeds') {
      const feeds: Record<string, ort.Tensor> = {};
      for (const [key, f] of Object.entries(msg.feeds)) {
        feeds[key] = f.data instanceof BigInt64Array ? new ort.Tensor('int64', f.data, f.dims) : new ort.Tensor('float32', f.data, f.dims);
      }
      const result = await session.run(feeds, [msg.output]);
      scope.postMessage({ id: msg.id, ok: true, result: Float32Array.from(result[msg.output].data as Float32Array) });
      return;
    }
    const out = await session.run({ features: new ort.Tensor('float32', msg.data, [msg.rows, msg.cols]) }, ['probabilities']);
    const probs = out.probabilities.data as Float32Array;
    // Two columns per row (lose, win); keep the win column.
    const win = new Float32Array(msg.rows);
    for (let i = 0; i < msg.rows; i++) win[i] = probs[i * 2 + 1];
    scope.postMessage({ id: msg.id, ok: true, result: win });
  } catch (err) {
    scope.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
