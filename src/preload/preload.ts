import { contextBridge, ipcRenderer } from 'electron';

type Disposer = () => void;

contextBridge.exposeInMainWorld('assistant', {
  version: '0.2.0',
  teamsList: () => ipcRenderer.invoke('teams:list') as Promise<
    { id: string; name: string; tag: string; updatedAt: number }[]
  >,
  teamsLoad: (id: string) => ipcRenderer.invoke('teams:load', id),
  teamsSave: (payload: unknown) => ipcRenderer.invoke('teams:save', payload) as Promise<{ id: string }>,
  teamsDelete: (id: string) => ipcRenderer.invoke('teams:delete', id) as Promise<void>,

  pcBoxesList: () => ipcRenderer.invoke('pc:boxes:list'),
  pcBoxCreate: (name: string) => ipcRenderer.invoke('pc:boxes:create', name),
  pcBoxRename: (id: string, name: string) => ipcRenderer.invoke('pc:boxes:rename', id, name),
  pcBoxDelete: (id: string) => ipcRenderer.invoke('pc:boxes:delete', id),
  pcBoxReorder: (ids: string[]) => ipcRenderer.invoke('pc:boxes:reorder', ids),
  pcPokemonList: (boxId: string) => ipcRenderer.invoke('pc:pokemon:list', boxId),
  pcPokemonSave: (payload: unknown) => ipcRenderer.invoke('pc:pokemon:save', payload) as Promise<{ id: string }>,
  pcPokemonDelete: (id: string) => ipcRenderer.invoke('pc:pokemon:delete', id),
  pcPokemonMove: (id: string, boxId: string, slot: number) =>
    ipcRenderer.invoke('pc:pokemon:move', id, boxId, slot),

  // ---- Cobblemon mod bridge -----------------------------------
  modBridge: {
    start: (config?: { host?: string; port?: number; path?: string }) =>
      ipcRenderer.invoke('cobblemon:bridge:start', config) as Promise<{ url: string } | { error: string }>,
    stop: () => ipcRenderer.invoke('cobblemon:bridge:stop') as Promise<void>,
    getStatus: () => ipcRenderer.invoke('cobblemon:bridge:status') as Promise<unknown>,
    onFrame(cb: (payload: unknown) => void): Disposer {
      const handler = (_e: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on('cobblemon:frame', handler);
      return () => ipcRenderer.removeListener('cobblemon:frame', handler);
    },
    onStatus(cb: (status: unknown) => void): Disposer {
      const handler = (_e: unknown, status: unknown) => cb(status);
      ipcRenderer.on('cobblemon:status', handler);
      return () => ipcRenderer.removeListener('cobblemon:status', handler);
    },
    onInvalidFrame(cb: (info: { error: string }) => void): Disposer {
      const handler = (_e: unknown, info: { error: string }) => cb(info);
      ipcRenderer.on('cobblemon:invalid-frame', handler);
      return () => ipcRenderer.removeListener('cobblemon:invalid-frame', handler);
    },
  },
});
