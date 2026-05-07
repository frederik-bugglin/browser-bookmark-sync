import { ipcMain, shell, app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { JsonStore } from './store';
import { AppStateSchema, SettingsSchema, type AppState, type Settings } from './state';
import type { WindowManager } from './windows';
import { configureAutoLaunch } from './autolaunch';
import type { AuthService, AuthStatus } from './auth';
import type { PermissionsService, PermissionsState } from './permissions';
import type { SyncService, SyncState } from './sync';

type Deps = {
  appStateStore: JsonStore<AppState>;
  settingsStore: JsonStore<Settings>;
  windows: WindowManager;
  auth: AuthService;
  permissions: PermissionsService;
  sync: SyncService;
  getAllWindows: () => BrowserWindow[];
};

export function registerIpcHandlers({ appStateStore, settingsStore, windows, auth, permissions, sync, getAllWindows }: Deps): void {
  ipcMain.handle('app:state:get', () => appStateStore.get());

  ipcMain.handle('app:state:set', (_e, patch: unknown) => {
    const parsed = AppStateSchema.partial().safeParse(patch);
    if (!parsed.success) throw new Error('Invalid app state patch');
    return appStateStore.set(parsed.data as Partial<AppState>);
  });

  ipcMain.handle('settings:get', () => settingsStore.get());

  ipcMain.handle('settings:set', (_e, patch: unknown) => {
    const parsed = SettingsSchema.partial().safeParse(patch);
    if (!parsed.success) throw new Error('Invalid settings patch');
    const updated = settingsStore.set(parsed.data as Partial<Settings>);
    if (typeof parsed.data.autoLaunch === 'boolean') {
      configureAutoLaunch(parsed.data.autoLaunch);
    }
    return updated;
  });

  ipcMain.handle('window:show-main', () => windows.showMain());
  ipcMain.handle('window:hide-popover', () => windows.hidePopover());
  ipcMain.handle('window:show-onboarding', () => windows.showOnboarding());

  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:open-external', (_e, url: unknown) => {
    if (typeof url !== 'string') throw new Error('URL must be a string');
    return shell.openExternal(url);
  });

  ipcMain.handle('auth:status:get', () => auth.getStatus());

  ipcMain.handle('auth:request-magic-link', async (_e, email: unknown) => {
    if (typeof email !== 'string') throw new Error('email must be a string');
    return auth.requestMagicLink(email);
  });

  ipcMain.handle('auth:sign-out', async () => {
    await auth.signOut();
  });

  ipcMain.handle('permissions:state:get', () => permissions.getState());
  ipcMain.handle('permissions:probe-safari', () => permissions.probeSafari());
  ipcMain.handle('permissions:open-safari-settings', () => permissions.openSafariSettings());

  ipcMain.handle('sync:state:get', () => sync.getState());
  ipcMain.handle('sync:run', async (_e, triggeredBy: unknown) => {
    const allowed = ['manual', 'auto', 'restore'] as const;
    const t = typeof triggeredBy === 'string' && (allowed as readonly string[]).includes(triggeredBy)
      ? (triggeredBy as 'manual' | 'auto' | 'restore')
      : 'manual';
    return sync.run(t);
  });

  // During shutdown, webContents can be destroyed before the BrowserWindow
  // itself reports isDestroyed() = true. We need to guard both checks AND
  // wrap in try/catch because Electron occasionally races the destruction
  // even further (between our check and the send call).
  function broadcast(channel: string, payload: unknown): void {
    for (const win of getAllWindows()) {
      if (win.isDestroyed()) continue;
      const wc = win.webContents;
      if (wc.isDestroyed()) continue;
      try {
        wc.send(channel, payload);
      } catch {
        // Window torn down between the isDestroyed check and the send.
        // Best-effort delivery; the renderer will resync on next launch.
      }
    }
  }

  appStateStore.on('change', (state: AppState) => broadcast('app:state:changed', state));
  settingsStore.on('change', (settings: Settings) => broadcast('settings:changed', settings));
  auth.on('change', (status: AuthStatus) => broadcast('auth:status:changed', status));
  permissions.on('change', (state: PermissionsState) => broadcast('permissions:state:changed', state));
  sync.on('change', (state: SyncState) => broadcast('sync:state:changed', state));
}
