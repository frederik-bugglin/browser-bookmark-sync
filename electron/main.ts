import { app, BrowserWindow, dialog, powerMonitor } from 'electron';
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
import { SyncService, type SyncState } from './sync';
import { SyncTrigger, createDnsProbe, createElectronNotifier } from './sync-trigger';
import { BrowsersService, migrateSettingsV1ToV2 } from './browsers';
import { ConflictsService } from './conflicts';
import { installCsp } from './csp';
import { registerAppProtocolScheme, registerAppProtocolHandler } from './protocol';

// Must run before app.whenReady() — registers the 'app' scheme as
// standard/secure so the renderer can load via app://-/.
registerAppProtocolScheme();

const PROTOCOL = 'junction';
let pendingDeepLink: string | null = null;
let authService: AuthService | null = null;

// Cold-start case: macOS may launch the app with the deep-link URL as a
// command-line argument (in addition to or instead of firing 'open-url').
// Capture it here so it gets handled once authService is ready.
function findDeepLinkInArgv(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null;
}
const initialArgvDeepLink = findDeepLinkInArgv(process.argv);
if (initialArgvDeepLink) pendingDeepLink = initialArgvDeepLink;

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

  registerAppProtocolHandler();
  installCsp();

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

  // BrowsersService must exist before the v1→v2 migration so we can pre-fill
  // enabledBrowsers / acknowledgedBrowsers with currently-detected IDs.
  const browsersService = new BrowsersService(settingsStore);
  migrateSettingsV1ToV2(settingsStore, browsersService);

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
  const syncService = new SyncService(syncEngine, authService, settingsStore);

  // Mirror sync state to AppState so Renderer subscribers (popover, header,
  // tray) see run progress regardless of who triggered the sync (tray click,
  // renderer IPC, or auto-trigger). 'skipped-offline' is owned by SyncTrigger
  // and is not overwritten here.
  syncService.on('change', (state: SyncState) => {
    if (state.isRunning) {
      appStateStore.set({ lastSyncStatus: 'running' });
      return;
    }
    if (!state.lastResult) return;
    const isError = state.lastResult.outcome === 'error';
    appStateStore.set({
      lastSyncStatus: isError ? 'error' : 'success',
      lastSyncAt: new Date().toISOString(),
    });
  });

  const syncTrigger = new SyncTrigger({
    syncService,
    appStateStore,
    settingsStore,
    authService,
    isOnline: createDnsProbe(configResult.config.SUPABASE_URL),
    notify: createElectronNotifier(),
    powerEvents: powerMonitor,
  });

  const conflictsService = new ConflictsService({
    supabaseProvider: () => authService!.getClient(),
    cloud: createSupabaseCloudClient(authService.getClient()),
    auth: authService,
    appStateStore,
    triggerSync: () => syncTrigger.triggerNow(),
  });

  // Boot-time prune (best-effort, gated on auth + once-per-day inside service).
  void conflictsService.pruneIfDue();

  const windows = new WindowManager(appStateStore);

  registerIpcHandlers({
    appStateStore,
    settingsStore,
    windows,
    auth: authService,
    permissions: permissionsService,
    sync: syncService,
    browsers: browsersService,
    conflicts: conflictsService,
    getAllWindows: () => BrowserWindow.getAllWindows(),
  });

  const tray = createTray(windows, appStateStore, () => {
    void syncTrigger.triggerNow();
  });

  syncTrigger.start();

  if (authService.getStatus().state !== 'authenticated') {
    await windows.showOnboarding();
  }

  if (pendingDeepLink) {
    const url = pendingDeepLink;
    pendingDeepLink = null;
    void handleDeepLink(url);
  }

  app.on('second-instance', (_event, argv) => {
    void windows.showMain();
    // macOS can deliver the deep-link URL via argv on a second-instance call
    // when the user clicks junction:// while Junction is already running.
    // Without this, the magic-link callback would silently drop.
    const url = findDeepLinkInArgv(argv);
    if (url) void handleDeepLink(url);
  });

  app.on('window-all-closed', () => {
    // Junction lives in the tray; do not quit when all windows are closed.
  });

  app.on('before-quit', () => {
    windows.setQuitting(true);
    syncTrigger.stop();
    tray.destroy();
  });
}
