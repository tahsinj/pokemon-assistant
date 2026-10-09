import { app, BrowserWindow, ipcMain, nativeImage, net } from 'electron';
import path from 'node:path';
import {
  createPcBox,
  deletePcBox,
  deletePcPokemon,
  deleteTeam,
  initDb,
  listPcBoxes,
  listPcPokemon,
  listTeams,
  loadTeam,
  movePcPokemon,
  renamePcBox,
  reorderPcBoxes,
  savePcPokemon,
  saveTeam,
} from './db';
import { registerSpriteSchemePrivileged, registerSpriteProtocol } from './spriteCache';
import { migrateLegacyUserData } from './legacyUserData';
import { MANIFEST_URL, PackStore } from './packs';

// STABLAB_LOAD_BUILD=1 runs the built renderer from an unpackaged Electron,
// as the installed app does (the Electron smoke test uses it).
const isDev = !app.isPackaged && process.env.STABLAB_LOAD_BUILD !== '1';

// Carry saved PC / teams over from the pre-rename data folder.
migrateLegacyUserData();

// Privileged-scheme registration must happen before the app `ready` event.
registerSpriteSchemePrivileged();

// Dev runs inside the stock Electron binary, which carries the default
// Electron icon - set ours at runtime. Packaged builds get the icon baked
// into the executable by electron-builder (build/icon.ico), so this path
// won't exist there and the empty image is simply skipped.
const appIcon = nativeImage.createFromPath(path.join(__dirname, '../../build/icon.png'));

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f172a',
    title: 'STAB Lab',
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  win.setMenuBarVisibility(false);
}

async function bootstrap() {
  // Serve cpsprite:// from the per-user sprite cache (offline-capable).
  registerSpriteProtocol();

  await initDb();

  ipcMain.handle('teams:list', () => listTeams());
  ipcMain.handle('teams:load', (_e, id: string) => loadTeam(id));
  ipcMain.handle('teams:save', (_e, payload: unknown) => saveTeam(payload as Parameters<typeof saveTeam>[0]));
  ipcMain.handle('teams:delete', (_e, id: string) => {
    deleteTeam(id);
    return undefined;
  });

  ipcMain.handle('pc:boxes:list', () => listPcBoxes());
  ipcMain.handle('pc:boxes:create', (_e, name: string) => createPcBox(name));
  ipcMain.handle('pc:boxes:rename', (_e, id: string, name: string) => {
    renamePcBox(id, name);
    return undefined;
  });
  ipcMain.handle('pc:boxes:delete', (_e, id: string) => {
    deletePcBox(id);
    return undefined;
  });
  ipcMain.handle('pc:boxes:reorder', (_e, ids: string[]) => {
    reorderPcBoxes(ids);
    return undefined;
  });
  ipcMain.handle('pc:pokemon:list', (_e, boxId: string) => listPcPokemon(boxId));
  ipcMain.handle('pc:pokemon:save', (_e, payload: unknown) =>
    savePcPokemon(payload as Parameters<typeof savePcPokemon>[0]),
  );
  ipcMain.handle('pc:pokemon:delete', (_e, id: string) => {
    deletePcPokemon(id);
    return undefined;
  });
  ipcMain.handle('pc:pokemon:move', (_e, id: string, boxId: string, slot: number) => {
    movePcPokemon(id, boxId, slot);
    return undefined;
  });

  // STABLAB_PACKS_URL points at another manifest (a local build, a test server).
  const packs = new PackStore(
    path.join(app.getPath('userData'), 'packs'),
    (url) => net.fetch(url),
    process.env.STABLAB_PACKS_URL ?? MANIFEST_URL,
  );
  void packs.refresh();
  ipcMain.handle('packs:get', (_e, name: string) => packs.get(name));
  ipcMain.handle('packs:status', () => packs.status());
  ipcMain.handle('packs:refresh', async () => {
    await packs.refresh(true);
    return packs.status();
  });

  createWindow();
}

app.whenReady().then(() => {
  // BrowserWindow icons are ignored on macOS - the Dock icon is set here.
  if (process.platform === 'darwin' && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }
  return bootstrap();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
