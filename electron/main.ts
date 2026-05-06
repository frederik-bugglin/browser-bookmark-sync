import { app, BrowserWindow, dialog } from 'electron';
import { JsonStore } from './store';
import { AppStateSchema, SettingsSchema, defaultAppState, defaultSettings, type AppState, type Settings } from './state';
import { WindowManager } from './windows';
import { createTray } from './tray';
import { registerIpcHandlers } from './ipc';
import { configureAutoLaunch } from './autolaunch';
import { tryLoadConfig } from './config';
import { AuthService } from './auth';
import { PermissionsService } from './permissions';
import {
  SyncEngine,
  createLogStore,
  createRealDrivers,
  createSupabaseCloudClient,
} from './sync-engine';
import { SyncService } from './sync';

const PROTOCOL = 'junction';
let pendingDeepLink: string | null = null;
let authService: AuthService | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  registerProtocolHandler();
  void boot();
}

function registerProtocolHandler(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    if (authService) {
      void handleDeepLink(url);
    } else {
      pendingDeepLink = url;
    }
  });
}

async function handleDeepLink(url: string): Promise<void> {
  if (!authService) return;
  if (!url.startsWith(`${PROTOCOL}://auth/callback`)) return;
  const result = await authService.handleCallback(url);
  if (!result.ok) {
    dialog.showErrorBox('Login fehlgeschlagen', result.message);
  }
}

async function boot(): Promise<void> {
  await app.whenReady();

  if (process.platform === 'darwin') app.dock?.hide();

  const configResult = tryLoadConfig();
  if (!configResult.ok) {
    dialog.showErrorBox(
      'Konfiguration fehlt',
      `${configResult.message}\n\nDie App wird beendet. Siehe docs/supabase-setup.md.`,
    );
    app.quit();
    return;
  }

  const appStateStore = new JsonStore<AppState>('app-state.json', AppStateSchema, defaultAppState);
  const settingsStore = new JsonStore<Settings>('settings.json', SettingsSchema, defaultSettings);

  configureAutoLaunch(settingsStore.get().autoLaunch);

  authService = new AuthService(configResult.config);
  await authService.init();

  const permissionsService = new PermissionsService();
  // Probe at boot so the renderer's first state read reflects reality even
  // before any UI requests it. The probe is synchronous and <1 ms.
  permissionsService.probeSafari();

  const syncEngine = new SyncEngine({
    cloud: createSupabaseCloudClient(authService.getClient()),
    drivers: createRealDrivers({ userDataDir: app.getPath('userData') }),
    logStore: createLogStore(app.getPath('userData')),
  });
  const syncService = new SyncService(syncEngine, authService);

  const windows = new WindowManager(appStateStore);

  registerIpcHandlers({
    appStateStore,
    settingsStore,
    windows,
    auth: authService,
    permissions: permissionsService,
    sync: syncService,
    getAllWindows: () => BrowserWindow.getAllWindows(),
  });

  const tray = createTray(windows, appStateStore, () => {
    appStateStore.set({ lastSyncStatus: 'idle' });
  });

  if (authService.getStatus().state !== 'authenticated') {
    await windows.showOnboarding();
  }

  if (pendingDeepLink) {
    const url = pendingDeepLink;
    pendingDeepLink = null;
    void handleDeepLink(url);
  }

  app.on('second-instance', () => {
    void windows.showMain();
  });

  app.on('window-all-closed', () => {
    // Junction lives in the tray; do not quit when all windows are closed.
  });

  app.on('before-quit', () => {
    windows.setQuitting(true);
    tray.destroy();
  });
}
