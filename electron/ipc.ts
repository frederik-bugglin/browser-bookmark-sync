import { ipcMain, app } from 'electron';
import type { BrowserWindow } from 'electron';
import type { JsonStore } from './store';
import { AppStateSchema, SettingsSchema, BrowserIdSchema, type AppState, type BrowserId, type Settings } from './state';
import type { WindowManager } from './windows';
import { configureAutoLaunch } from './autolaunch';
import type { AuthService, AuthStatus } from './auth';
import type { PermissionsService, PermissionsState } from './permissions';
import type { SyncService, SyncState } from './sync';
import type { BrowsersService, BrowserStatus } from './browsers';
import type { ConflictsService } from './conflicts';
import type { ConflictFilter } from './conflicts/types';
import { safeOpenExternal } from './safe-open-external';

type Deps = {
  appStateStore: JsonStore<AppState>;
  settingsStore: JsonStore<Settings>;
  windows: WindowManager;
  auth: AuthService;
  permissions: PermissionsService;
  sync: SyncService;
  browsers: BrowsersService;
  conflicts: ConflictsService;
  getAllWindows: () => BrowserWindow[];
};

export function registerIpcHandlers({ appStateStore, settingsStore, windows, auth, permissions, sync, browsers, conflicts, getAllWindows }: Deps): void {
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
  ipcMain.handle('app:open-external', async (_e, url: unknown) => {
    if (typeof url !== 'string') throw new Error('URL must be a string');
    await safeOpenExternal(url);
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
  ipcMain.handle('sync:await-idle', () => sync.awaitIdle());

  ipcMain.handle('browsers:list', () => browsers.list());
  ipcMain.handle('browsers:refresh', () => browsers.refresh());
  ipcMain.handle('browsers:open-permissions', async (_e, browserId: unknown) => {
    const parsed = BrowserIdSchema.safeParse(browserId);
    if (!parsed.success) throw new Error('Invalid browser id');
    if (parsed.data === 'safari') {
      return permissions.openSafariSettings();
    }
    // Other browsers don't currently require an explicit permission flow.
  });
  ipcMain.handle('browsers:set-enabled', (_e, browserId: unknown, enabled: unknown) => {
    const parsed = BrowserIdSchema.safeParse(browserId);
    if (!parsed.success) throw new Error('Invalid browser id');
    if (typeof enabled !== 'boolean') throw new Error('enabled must be boolean');
    const id = parsed.data;
    const current = settingsStore.get();
    const enabledSet = new Set<BrowserId>(current.enabledBrowsers);
    const ackSet = new Set<BrowserId>(current.acknowledgedBrowsers);
    if (enabled) enabledSet.add(id);
    else enabledSet.delete(id);
    ackSet.add(id);
    settingsStore.set({
      enabledBrowsers: [...enabledSet],
      acknowledgedBrowsers: [...ackSet],
    });
  });
  ipcMain.handle('browsers:acknowledge', (_e, browserId: unknown) => {
    const parsed = BrowserIdSchema.safeParse(browserId);
    if (!parsed.success) throw new Error('Invalid browser id');
    const current = settingsStore.get();
    const ackSet = new Set<BrowserId>(current.acknowledgedBrowsers);
    ackSet.add(parsed.data);
    settingsStore.set({ acknowledgedBrowsers: [...ackSet] });
  });

  ipcMain.handle('conflicts:list', (_e, filter: unknown) => {
    // Accept any object; the service does its own validation via ConflictFilter shape.
    const f = (typeof filter === 'object' && filter ? filter : {}) as ConflictFilter;
    return conflicts.list(f);
  });
  ipcMain.handle('conflicts:get-by-id', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('id must be string');
    return conflicts.getById(id);
  });
  ipcMain.handle('conflicts:count-since-last-seen', () => conflicts.countSinceLastSeen());
  ipcMain.handle('conflicts:mark-seen', () => {
    conflicts.markSeen();
  });
  ipcMain.handle('conflicts:restore', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('id must be string');
    return conflicts.restore(id);
  });
  ipcMain.handle('conflicts:dismiss', (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('id must be string');
    return conflicts.dismiss(id);
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
  browsers.on('change', (list: BrowserStatus[]) => broadcast('browsers:changed', list));
  conflicts.on('change', () => broadcast('conflicts:changed', undefined));
}
