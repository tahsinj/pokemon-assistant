/**
 * React hook that bridges the Electron-main WebSocket listener to the
 * renderer's battle engine. It manages a small lifecycle:
 *
 *   1. Connect / disconnect commands.
 *   2. Track connection status (`idle` -> `listening` -> `connected` -> error).
 *   3. Pipe each incoming `ModBattleEventMessage` through the normalizer and
 *      hand the resulting `BattleEvent`s to the caller-supplied `onEvents`
 *      callback. The caller is expected to dispatch them through
 *      `applyEventAndPredict`.
 *
 * Non-event messages (`hello`, `status`, `error`) are surfaced via the
 * `status` field.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModBridgeStatus } from '../../bridgeTypes';
import { normalize } from './normalize';
import type { ModMessage } from './protocol';
import type { BattleEvent } from '../events';
import type { BattleState } from '../state';
import type { Pokemon } from '../../types';

export interface UseModBridgeOptions {
  /** Lookup table for species names (lowercase) -> Pokémon row. */
  pokemonByName: Record<string, Pokemon>;
  /** Current battle state - required by the normalizer for HP delta math. */
  stateRef: { current: BattleState };
  /** Called with the normalized events for each incoming frame. */
  onEvents: (events: BattleEvent[]) => void;
  /** Called when a non-event message arrives (hello / error / status). */
  onMessage?: (msg: ModMessage) => void;
}

export interface UseModBridgeReturn {
  status: ModBridgeStatus;
  available: boolean;
  /** Recent invalid-frame errors (last 5). */
  invalidFrames: string[];
  start: (config?: { host?: string; port?: number; path?: string }) => Promise<{ url: string } | { error: string }>;
  stop: () => Promise<void>;
}

export function useModBridge(opts: UseModBridgeOptions): UseModBridgeReturn {
  const [status, setStatus] = useState<ModBridgeStatus>({ kind: 'idle' });
  const [invalidFrames, setInvalidFrames] = useState<string[]>([]);
  const bridge = typeof window !== 'undefined' ? window.cobblemon?.modBridge : undefined;
  const available = !!bridge;

  // Keep callbacks stable across renders.
  const onEventsRef = useRef(opts.onEvents);
  const onMessageRef = useRef(opts.onMessage);
  onEventsRef.current = opts.onEvents;
  onMessageRef.current = opts.onMessage;

  const stateRef = opts.stateRef;
  const pokemonByName = opts.pokemonByName;

  useEffect(() => {
    if (!bridge) return;

    // Sync current status snapshot once on mount.
    bridge
      .getStatus()
      .then((s) => setStatus(s))
      .catch(() => {
        /* ignore */
      });

    const offStatus = bridge.onStatus((s) => setStatus(s));
    const offFrame = bridge.onFrame((raw) => {
      const msg = raw as ModMessage;
      if (msg.type === 'event') {
        const events = normalize(msg, { pokemonByName, state: stateRef.current });
        if (events.length > 0) onEventsRef.current(events);
      }
      onMessageRef.current?.(msg);
    });
    const offInvalid = bridge.onInvalidFrame((info) => {
      setInvalidFrames((prev) => [info.error, ...prev].slice(0, 5));
    });
    return () => {
      offStatus();
      offFrame();
      offInvalid();
    };
  }, [bridge, pokemonByName, stateRef]);

  const start = useCallback(
    (config?: { host?: string; port?: number; path?: string }) => {
      if (!bridge) return Promise.resolve({ error: 'mod bridge unavailable' });
      return bridge.start(config);
    },
    [bridge],
  );

  const stop = useCallback(() => {
    if (!bridge) return Promise.resolve();
    return bridge.stop();
  }, [bridge]);

  return { status, available, invalidFrames, start, stop };
}
