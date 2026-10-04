/** Runs a practice battle off the UI thread. See practiceClient.ts for the other end. */
import { PracticeSession } from './session';
import type { PracticeRequest, PracticeResponse } from './practiceClient';

let session: PracticeSession | null = null;

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<PracticeRequest>) => void) | null;
  postMessage(message: PracticeResponse): void;
};

scope.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'start') session = new PracticeSession(msg.options);
    if (!session) throw new Error('No battle is running.');
    const result =
      msg.type === 'choose'
        ? session.choose(msg.choice)
        : msg.type === 'undo'
          ? session.undo()
          : msg.type === 'export'
            ? session.exportLog()
            : msg.type === 'hint'
              ? session.hint()
              : session.view();
    scope.postMessage({ id: msg.id, ok: true, result });
  } catch (err) {
    scope.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
