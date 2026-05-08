import type {
  AppState,
  AuthRequestResult,
  AuthStatus,
  PermissionStatus,
  PermissionsState,
  Settings,
  SyncEngineState,
  SyncRunSummary,
} from './types';

type Bridge = {
  appState: {
    get: () => Promise<AppState>;
    set: (patch: Partial<AppState>) => Promise<AppState>;
    subscribe: (listener: (state: AppState) => void) => () => void;
  };
  settings: {
    get: () => Promise<Settings>;
    set: (patch: Partial<Settings>) => Promise<Settings>;
    subscribe: (listener: (settings: Settings) => void) => () => void;
  };
  window: {
    showMain: () => Promise<void>;
    hidePopover: () => Promise<void>;
    showOnboarding: () => Promise<void>;
  };
  auth: {
    getStatus: () => Promise<AuthStatus>;
    requestMagicLink: (email: string) => Promise<AuthRequestResult>;
    signOut: () => Promise<void>;
    subscribe: (listener: (status: AuthStatus) => void) => () => void;
  };
  permissions: {
    getState: () => Promise<PermissionsState>;
    probeSafari: () => Promise<PermissionStatus>;
    openSafariSettings: () => Promise<void>;
    subscribe: (listener: (state: PermissionsState) => void) => () => void;
  };
  sync: {
    getState: () => Promise<SyncEngineState>;
    run: (
      triggeredBy: 'manual' | 'auto' | 'restore',
    ) => Promise<{ runId: string; outcome: SyncRunSummary['outcome']; log: SyncRunSummary }>;
    subscribe: (listener: (state: SyncEngineState) => void) => () => void;
  };
  app: {
    quit: () => Promise<void>;
    openExternal: (url: string) => Promise<void>;
    platform: () => NodeJS.Platform;
  };
};

declare global {
  interface Window {
    junction?: Bridge;
  }
}

const FALLBACK_APP_STATE: AppState = {
  schemaVersion: 1,
  firstLaunchDone: false,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  nextScheduledSyncAt: null,
  mainWindowBounds: null,
};

const FALLBACK_SETTINGS: Settings = {
  schemaVersion: 1,
  autoLaunch: true,
  autoSyncEnabled: true,
  autoSyncIntervalMin: 15,
  notifyOnSyncError: false,
};

const FALLBACK_PERMISSIONS: PermissionsState = {
  safari: 'unknown',
};

const FALLBACK_SYNC_STATE: SyncEngineState = {
  isRunning: false,
  lastResult: null,
};

// Mock-Bridge persists user-toggleable state in sessionStorage so navigations
// between /settings and /popover keep the toggle state during browser-dev.
// In Electron, this code path is never used (window.junction is the real bridge).
const MOCK_KEY = 'junction:mock';

type MockPersisted = {
  appState: AppState;
  settings: Settings;
};

function loadMockPersisted(): MockPersisted {
  if (typeof window === 'undefined') {
    return { appState: { ...FALLBACK_APP_STATE }, settings: { ...FALLBACK_SETTINGS } };
  }
  try {
    const raw = window.sessionStorage.getItem(MOCK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MockPersisted>;
      return {
        appState: { ...FALLBACK_APP_STATE, ...parsed.appState },
        settings: { ...FALLBACK_SETTINGS, ...parsed.settings },
      };
    }
  } catch {
    // ignore corrupt sessionStorage entries
  }
  return { appState: { ...FALLBACK_APP_STATE }, settings: { ...FALLBACK_SETTINGS } };
}

function saveMockPersisted(data: MockPersisted): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(MOCK_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors etc.
  }
}

function createMockBridge(): Bridge {
  const persisted = loadMockPersisted();
  let appState = persisted.appState;
  let settings = persisted.settings;
  let authStatus: AuthStatus = { state: 'unauthenticated' };
  let permissions: PermissionsState = { ...FALLBACK_PERMISSIONS };
  let syncState: SyncEngineState = { ...FALLBACK_SYNC_STATE };
  const persist = () => saveMockPersisted({ appState, settings });
  const appStateListeners = new Set<(s: AppState) => void>();
  const settingsListeners = new Set<(s: Settings) => void>();
  const authListeners = new Set<(s: AuthStatus) => void>();
  const permissionListeners = new Set<(s: PermissionsState) => void>();
  const syncListeners = new Set<(s: SyncEngineState) => void>();
  // First probe in the mock returns 'denied' (simulates the typical first-run
  // state). Each "I granted it" press flips to 'granted'.
  let mockSafariProbeCount = 0;

  return {
    appState: {
      get: async () => appState,
      set: async (patch) => {
        appState = { ...appState, ...patch };
        persist();
        appStateListeners.forEach((l) => l(appState));
        return appState;
      },
      subscribe: (l) => {
        appStateListeners.add(l);
        return () => appStateListeners.delete(l);
      },
    },
    settings: {
      get: async () => settings,
      set: async (patch) => {
        settings = { ...settings, ...patch };
        persist();
        settingsListeners.forEach((l) => l(settings));
        return settings;
      },
      subscribe: (l) => {
        settingsListeners.add(l);
        return () => settingsListeners.delete(l);
      },
    },
    window: {
      showMain: async () => {},
      hidePopover: async () => {},
      showOnboarding: async () => {},
    },
    auth: {
      getStatus: async () => authStatus,
      requestMagicLink: async (email) => {
        if (!email.includes('@')) return { ok: false, message: 'Mock-Bridge: ungültige E-Mail.' };
        // Simulate the mail-arrives-and-is-clicked flow after a short delay.
        setTimeout(() => {
          authStatus = { state: 'authenticated', email, userId: 'mock-user' };
          authListeners.forEach((l) => l(authStatus));
        }, 1500);
        return { ok: true };
      },
      signOut: async () => {
        authStatus = { state: 'unauthenticated' };
        authListeners.forEach((l) => l(authStatus));
      },
      subscribe: (l) => {
        authListeners.add(l);
        return () => authListeners.delete(l);
      },
    },
    permissions: {
      getState: async () => permissions,
      probeSafari: async () => {
        mockSafariProbeCount += 1;
        // First probe -> denied (simulates fresh install). Subsequent probes
        // (after the user pressed "Open System Settings" + "I granted it")
        // flip to granted.
        const next: PermissionStatus = mockSafariProbeCount === 1 ? 'denied' : 'granted';
        permissions = { ...permissions, safari: next };
        permissionListeners.forEach((l) => l(permissions));
        return next;
      },
      openSafariSettings: async () => {
        if (typeof window !== 'undefined') {
          window.open(
            'https://support.apple.com/de-ch/guide/mac-help/mh32356/mac',
            '_blank',
            'noopener',
          );
        }
      },
      subscribe: (l) => {
        permissionListeners.add(l);
        return () => permissionListeners.delete(l);
      },
    },
    sync: {
      getState: async () => syncState,
      run: async (_triggeredBy) => {
        // Mock-Run: emittiert running-State, simuliert kurze Dauer, gibt
        // plausibles Erfolgs-Result zurück. Spiegelt zusätzlich AppState
        // (lastSyncStatus / lastSyncAt), damit die UI-Pille korrekt schaltet.
        const runId = `mock-${Date.now()}`;
        syncState = { isRunning: true, lastResult: syncState.lastResult };
        syncListeners.forEach((l) => l(syncState));
        appState = { ...appState, lastSyncStatus: 'running' };
        persist();
        appStateListeners.forEach((l) => l(appState));

        await new Promise((r) => setTimeout(r, 600));

        const log: SyncRunSummary = {
          runId,
          outcome: 'success',
          durationMs: 600,
          conflictsWritten: 0,
          cloudBookmarksUpserted: 0,
          cloudBookmarksDeleted: 0,
          errors: [],
        };
        syncState = { isRunning: false, lastResult: { runId, outcome: 'success', log } };
        syncListeners.forEach((l) => l(syncState));
        appState = {
          ...appState,
          lastSyncStatus: 'success',
          lastSyncAt: new Date().toISOString(),
        };
        persist();
        appStateListeners.forEach((l) => l(appState));
        return { runId, outcome: 'success', log };
      },
      subscribe: (l) => {
        syncListeners.add(l);
        return () => syncListeners.delete(l);
      },
    },
    app: {
      quit: async () => {},
      openExternal: async (url) => {
        if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
      },
      platform: () => 'darwin',
    },
  };
}

let cachedBridge: Bridge | null = null;

export function junction(): Bridge {
  if (cachedBridge) return cachedBridge;
  if (typeof window !== 'undefined' && window.junction) {
    cachedBridge = window.junction;
    return cachedBridge;
  }
  cachedBridge = createMockBridge();
  return cachedBridge;
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.junction;
}
