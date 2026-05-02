/**
 * Electron main-process WebSocket bridge.
 *
 * Spins up a local-only `ws` server that the companion Cobblemon mod connects
 * to. Each well-formed frame is validated against the shared protocol and
 * forwarded to the renderer over IPC (`cobblemon:frame`). Connection state
 * transitions are forwarded over `cobblemon:status`.
 *
 * Design notes:
 *   - **Local only.** The server binds to `127.0.0.1` by default. Exposing the
 *     port to the LAN is opt-in via `start({ host: '0.0.0.0' })` and is
 *     intended for development against a remote Minecraft client only.
 *   - **Single connection.** The protocol assumes one mod <-> one assistant. A
 *     second client receives a friendly disconnect.
 *   - **Renderer ignorance.** The renderer cannot import `ws` (Node-only); it
 *     listens on the IPC channel and treats each frame as plain JSON.
 */

import { ipcMain, type BrowserWindow, type WebContents } from 'electron';
import type { AddressInfo } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import {
  PROTOCOL_VERSION,
  DEFAULT_PROTOCOL_PORT,
  DEFAULT_PROTOCOL_PATH,
  validateMessage,
  type ModMessage,
} from '../shared/cobblemonProtocol';

export interface BridgeConfig {
  host?: string;
  port?: number;
  path?: string;
}

export type BridgeStatus =
  | { kind: 'idle' }
  | { kind: 'listening'; url: string }
  | { kind: 'connected'; peer: string; hello?: ConnectedHello }
  | { kind: 'error'; message: string };

export interface ConnectedHello {
  modId: string;
  cobblemonVersion: string;
  minecraftVersion: string;
  playerUUID: string;
  protocolVersion: number;
}

export interface CobblemonBridge {
  start(config?: BridgeConfig): Promise<{ url: string }>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getStatus(): BridgeStatus;
  /** Wire a window's renderer to receive forwarded frames + status. */
  attachWindow(win: BrowserWindow): void;
}

export function createCobblemonBridge(): CobblemonBridge {
  let server: WebSocketServer | null = null;
  let currentSocket: WebSocket | null = null;
  let status: BridgeStatus = { kind: 'idle' };
  const attached: Set<WebContents> = new Set();

  function broadcast(channel: string, payload: unknown) {
    for (const wc of attached) {
      if (!wc.isDestroyed()) wc.send(channel, payload);
    }
  }

  function setStatus(next: BridgeStatus) {
    status = next;
    broadcast('cobblemon:status', next);
  }

  function teardownSocket(reason: string) {
    if (currentSocket) {
      try {
        currentSocket.close(1000, reason);
      } catch {
        /* ignore */
      }
      currentSocket = null;
    }
  }

  function handleConnection(ws: WebSocket, req: { socket: { remoteAddress?: string | undefined } }) {
    if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
      // Reject second simultaneous connection.
      try {
        ws.send(
          JSON.stringify({
            type: 'error',
            protocolVersion: PROTOCOL_VERSION,
            code: 'already-connected',
            message: 'Another mod client is already connected to this assistant',
          }),
        );
        ws.close(1013, 'already-connected');
      } catch {
        /* ignore */
      }
      return;
    }

    const peer = req.socket.remoteAddress ?? 'unknown';
    currentSocket = ws;
    setStatus({ kind: 'connected', peer });

    ws.on('message', (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        // Quietly drop invalid JSON - the mod is responsible for shape.
        return;
      }
      const err = validateMessage(parsed);
      if (err) {
        broadcast('cobblemon:invalid-frame', { error: err });
        return;
      }
      const msg = parsed as ModMessage;
      if (msg.type === 'hello') {
        setStatus({
          kind: 'connected',
          peer,
          hello: {
            modId: msg.modId,
            cobblemonVersion: msg.cobblemonVersion,
            minecraftVersion: msg.minecraftVersion,
            playerUUID: msg.playerUUID,
            protocolVersion: msg.protocolVersion,
          },
        });
      }
      broadcast('cobblemon:frame', msg);
    });

    ws.on('close', () => {
      if (currentSocket === ws) {
        currentSocket = null;
        if (server) {
          const addr = server.address() as AddressInfo | null;
          const url = addr ? `ws://${addr.address}:${addr.port}${server.options.path ?? ''}` : '';
          setStatus({ kind: 'listening', url });
        } else {
          setStatus({ kind: 'idle' });
        }
      }
    });

    ws.on('error', (e: Error) => {
      broadcast('cobblemon:invalid-frame', { error: `socket: ${e.message}` });
    });
  }

  return {
    isRunning: () => !!server,
    getStatus: () => status,

    attachWindow(win) {
      attached.add(win.webContents);
      win.on('closed', () => attached.delete(win.webContents));
      // Push the current snapshot so the renderer can render an
      // accurate indicator on mount.
      win.webContents.once('did-finish-load', () => win.webContents.send('cobblemon:status', status));
    },

    async start(config = {}) {
      const host = config.host ?? '127.0.0.1';
      const port = config.port ?? DEFAULT_PROTOCOL_PORT;
      const path = config.path ?? DEFAULT_PROTOCOL_PATH;

      if (server) {
        const addr = server.address() as AddressInfo | null;
        return { url: addr ? `ws://${addr.address}:${addr.port}${path}` : '' };
      }

      const wss = new WebSocketServer({ host, port, path });
      server = wss;
      const url = `ws://${host}:${port}${path}`;

      await new Promise<void>((resolve, reject) => {
        wss.once('listening', () => resolve());
        wss.once('error', (e: Error) => {
          server = null;
          setStatus({ kind: 'error', message: e.message });
          reject(e);
        });
      });

      wss.on('connection', handleConnection);
      wss.on('error', (e: Error) => {
        setStatus({ kind: 'error', message: e.message });
      });

      setStatus({ kind: 'listening', url });
      return { url };
    },

    async stop() {
      teardownSocket('shutdown');
      if (server) {
        const s = server;
        server = null;
        await new Promise<void>((resolve) => s.close(() => resolve()));
      }
      setStatus({ kind: 'idle' });
    },
  };
}

/**
 * Convenience: wire the bridge's IPC handlers onto the global `ipcMain`. The
 * renderer calls `cobblemon:bridge:start` / `stop` / `getStatus` to drive it.
 */
export function registerBridgeIpc(bridge: CobblemonBridge) {
  ipcMain.handle('cobblemon:bridge:start', async (_e, config: BridgeConfig | undefined) => {
    try {
      return await bridge.start(config);
    } catch (e: unknown) {
      return { error: (e as Error)?.message ?? String(e) };
    }
  });
  ipcMain.handle('cobblemon:bridge:stop', async () => {
    await bridge.stop();
    return undefined;
  });
  ipcMain.handle('cobblemon:bridge:status', () => bridge.getStatus());
}
