import { ipcMain, shell, app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { JsonStore } from './store';
import { AppStateSchema, SettingsSchema, type AppState, type Settings } from './state';
import type { WindowManager } from './windows';
import { configureAutoLaunch } from './autolaunch';
import type { AuthService, AuthStatus } from './auth';

type Deps = {
  appStateStore: JsonStore<AppState>;
  settingsStore: JsonStore<Settings>;
  windows: WindowManager;
  auth: AuthService;
  getAllWindows: () => BrowserWindow[];
};

export function registerIpcHandlers({ appStateStore, settingsStore, windows, auth, getAllWindows }: Deps): void {
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

  appStateStore.on('change', (state: AppState) => {
    for (const win of getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('app:state:changed', state);
    }
  });

  settingsStore.on('change', (settings: Settings) => {
    for (const win of getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('settings:changed', settings);
    }
  });

  auth.on('change', (status: AuthStatus) => {
    for (const win of getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('auth:status:changed', status);
    }
  });
}
