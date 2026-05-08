import type {
  AppState,
  AuthRequestResult,
  AuthStatus,
  BrowserId,
  BrowserStatus,
  ConflictEntry,
  ConflictFilter,
  ConflictListResult,
  PermissionStatus,
  PermissionsState,
  RestoreResult,
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
    awaitIdle: () => Promise<void>;
    subscribe: (listener: (state: SyncEngineState) => void) => () => void;
  };
  browsers: {
    list: () => Promise<BrowserStatus[]>;
    refresh: () => Promise<BrowserStatus[]>;
    setEnabled: (browserId: BrowserId, enabled: boolean) => Promise<void>;
    acknowledge: (browserId: BrowserId) => Promise<void>;
    openPermissions: (browserId: BrowserId) => Promise<void>;
    subscribe: (listener: (list: BrowserStatus[]) => void) => () => void;
  };
  conflicts: {
    list: (filter: ConflictFilter) => Promise<ConflictListResult>;
    getById: (id: string) => Promise<ConflictEntry | null>;
    countSinceLastSeen: () => Promise<number>;
    markSeen: () => Promise<void>;
    restore: (id: string) => Promise<RestoreResult>;
    dismiss: (id: string) => Promise<void>;
    subscribe: (listener: () => void) => () => void;
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
  schemaVersion: 2,
  firstLaunchDone: false,
  lastSyncAt: null,
  lastSyncStatus: 'idle',
  nextScheduledSyncAt: null,
  lastConflictsSeenAt: null,
  mainWindowBounds: null,
};

const FALLBACK_SETTINGS: Settings = {
  schemaVersion: 2,
  autoLaunch: true,
  autoSyncEnabled: true,
  autoSyncIntervalMin: 15,
  notifyOnSyncError: false,
  enabledBrowsers: [],
  acknowledgedBrowsers: [],
};

const MOCK_CONFLICTS: ConflictEntry[] = [
  {
    id: 'mock-conflict-1',
    bookmarkHash: 'h1',
    winnerVersion: {
      id: 'b1',
      url: 'https://www.anthropic.com/news/claude-4-7',
      urlNormalized: 'https://www.anthropic.com/news/claude-4-7',
      title: 'Claude 4.7 Release Notes',
      folderPath: '/lesezeichenleiste/recherche',
      rootKey: 'toolbar',
      dateAdded: '2026-04-12T10:00:00.000Z',
      dateModified: '2026-05-07T18:30:00.000Z',
    },
    loserVersion: {
      id: 'b1',
      url: 'https://www.anthropic.com/news/claude-4-7',
      urlNormalized: 'https://www.anthropic.com/news/claude-4-7',
      title: 'Claude 4.7 Release',
      folderPath: '/lesezeichenleiste/recherche/ai',
      rootKey: 'toolbar',
      dateAdded: '2026-04-12T10:00:00.000Z',
      dateModified: '2026-05-07T17:45:00.000Z',
    },
    winnerBrowserId: 'firefox',
    loserBrowserId: 'chrome',
    syncRunId: '00000000-0000-0000-0000-000000000001',
    status: 'open',
    createdAt: '2026-05-07T18:30:01.000Z',
    resolvedAt: null,
    restoreOriginId: null,
  },
  {
    id: 'mock-conflict-2',
    bookmarkHash: 'h2',
    winnerVersion: {
      id: 'b2',
      url: 'https://nextjs.org/docs/app',
      urlNormalized: 'https://nextjs.org/docs/app',
      title: 'Next.js App Router',
      folderPath: '/lesezeichenleiste/dev',
      rootKey: 'toolbar',
      dateAdded: '2026-03-01T09:00:00.000Z',
      dateModified: '2026-05-06T14:00:00.000Z',
    },
    loserVersion: {
      id: 'b2',
      url: 'https://nextjs.org/docs/app',
      urlNormalized: 'https://nextjs.org/docs/app',
      title: 'Next.js Docs',
      folderPath: '/lesezeichenleiste/dev',
      rootKey: 'toolbar',
      dateAdded: '2026-03-01T09:00:00.000Z',
      dateModified: '2026-05-06T13:50:00.000Z',
    },
    winnerBrowserId: 'chrome',
    loserBrowserId: 'zen',
    syncRunId: '00000000-0000-0000-0000-000000000002',
    status: 'restored',
    createdAt: '2026-05-06T14:00:01.000Z',
    resolvedAt: '2026-05-06T14:05:00.000Z',
    restoreOriginId: null,
  },
  {
    id: 'mock-conflict-3',
    bookmarkHash: 'h3',
    winnerVersion: {
      id: 'b3',
      url: 'https://tailwindcss.com/docs/installation',
      urlNormalized: 'https://tailwindcss.com/docs/installation',
      title: 'Tailwind CSS Setup',
      folderPath: '/lesezeichenleiste/dev/css',
      rootKey: 'toolbar',
      dateAdded: '2026-02-15T11:00:00.000Z',
      dateModified: '2026-05-05T09:00:00.000Z',
    },
    loserVersion: {
      id: 'b3',
      url: 'https://tailwindcss.com/docs/installation',
      urlNormalized: 'https://tailwindcss.com/docs/installation',
      title: 'Install Tailwind',
      folderPath: '/lesezeichenleiste/css',
      rootKey: 'toolbar',
      dateAdded: '2026-02-15T11:00:00.000Z',
      dateModified: '2026-05-05T08:55:00.000Z',
    },
    winnerBrowserId: 'firefox',
    loserBrowserId: 'arc',
    syncRunId: '00000000-0000-0000-0000-000000000003',
    status: 'dismissed',
    createdAt: '2026-05-05T09:00:01.000Z',
    resolvedAt: '2026-05-05T09:10:00.000Z',
    restoreOriginId: null,
  },
];

const MOCK_BROWSERS: BrowserStatus[] = [
  { id: 'chrome', name: 'Google Chrome', installed: true, detected: true, permissionsOk: true, enabled: true, acknowledged: true },
  { id: 'safari', name: 'Safari', installed: true, detected: false, permissionsOk: false, enabled: false, acknowledged: true },
  { id: 'firefox', name: 'Firefox', installed: true, detected: true, permissionsOk: true, enabled: true, acknowledged: true },
  { id: 'arc', name: 'Arc', installed: true, detected: true, permissionsOk: true, enabled: false, acknowledged: false },
  { id: 'brave', name: 'Brave', installed: false, detected: false, permissionsOk: true, enabled: false, acknowledged: false },
  { id: 'edge', name: 'Microsoft Edge', installed: false, detected: false, permissionsOk: true, enabled: false, acknowledged: false },
  { id: 'zen', name: 'Zen', installed: true, detected: true, permissionsOk: true, enabled: true, acknowledged: true },
  { id: 'dia', name: 'Dia', installed: false, detected: false, permissionsOk: true, enabled: false, acknowledged: false },
];

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
  let conflicts: ConflictEntry[] = MOCK_CONFLICTS.map((c) => ({ ...c }));
  const conflictListeners = new Set<() => void>();
  let browsers: BrowserStatus[] = MOCK_BROWSERS.map((b) => ({ ...b }));
  // Mock-Bridge syncs the browser list with settings.enabledBrowsers/acknowledged
  // so the renderer reflects toggle state correctly during browser-dev.
  const syncBrowserListWithSettings = () => {
    const enabledSet = new Set(settings.enabledBrowsers);
    const ackSet = new Set(settings.acknowledgedBrowsers);
    browsers = browsers.map((b) => ({
      ...b,
      enabled: enabledSet.has(b.id),
      acknowledged: ackSet.has(b.id),
    }));
  };
  // Pre-fill settings from MOCK_BROWSERS state on first run so the toggles
  // match the placeholder data (chrome/firefox/zen on, arc/safari/dia/edge/brave off).
  if (settings.enabledBrowsers.length === 0 && settings.acknowledgedBrowsers.length === 0) {
    settings = {
      ...settings,
      enabledBrowsers: browsers.filter((b) => b.enabled).map((b) => b.id),
      acknowledgedBrowsers: browsers.filter((b) => b.acknowledged).map((b) => b.id),
    };
  }
  syncBrowserListWithSettings();
  const persist = () => saveMockPersisted({ appState, settings });
  const appStateListeners = new Set<(s: AppState) => void>();
  const settingsListeners = new Set<(s: Settings) => void>();
  const authListeners = new Set<(s: AuthStatus) => void>();
  const permissionListeners = new Set<(s: PermissionsState) => void>();
  const syncListeners = new Set<(s: SyncEngineState) => void>();
  const browserListeners = new Set<(b: BrowserStatus[]) => void>();
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
      awaitIdle: async () => {
        // Mock-Bridge: poll until the simulated run finishes.
        while (syncState.isRunning) {
          await new Promise((r) => setTimeout(r, 50));
        }
      },
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
    browsers: {
      list: async () => browsers,
      refresh: async () => {
        syncBrowserListWithSettings();
        browserListeners.forEach((l) => l(browsers));
        return browsers;
      },
      setEnabled: async (browserId, enabled) => {
        const enabledSet = new Set(settings.enabledBrowsers);
        const ackSet = new Set(settings.acknowledgedBrowsers);
        if (enabled) enabledSet.add(browserId);
        else enabledSet.delete(browserId);
        ackSet.add(browserId);
        settings = {
          ...settings,
          enabledBrowsers: [...enabledSet],
          acknowledgedBrowsers: [...ackSet],
        };
        persist();
        settingsListeners.forEach((l) => l(settings));
        syncBrowserListWithSettings();
        browserListeners.forEach((l) => l(browsers));
      },
      acknowledge: async (browserId) => {
        const ackSet = new Set(settings.acknowledgedBrowsers);
        ackSet.add(browserId);
        settings = { ...settings, acknowledgedBrowsers: [...ackSet] };
        persist();
        settingsListeners.forEach((l) => l(settings));
        syncBrowserListWithSettings();
        browserListeners.forEach((l) => l(browsers));
      },
      openPermissions: async (browserId) => {
        if (typeof window !== 'undefined' && browserId === 'safari') {
          window.open('/onboarding/permissions/safari', '_self');
        }
      },
      subscribe: (l) => {
        browserListeners.add(l);
        return () => browserListeners.delete(l);
      },
    },
    conflicts: {
      list: async (filter) => {
        const limit = filter.limit ?? 50;
        const offset = filter.offset ?? 0;
        let filtered = [...conflicts].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        if (filter.status && filter.status !== 'all') {
          filtered = filtered.filter((c) => c.status === filter.status);
        }
        if (filter.winnerBrowserIds?.length) {
          filtered = filtered.filter((c) => filter.winnerBrowserIds!.includes(c.winnerBrowserId));
        }
        if (filter.loserBrowserIds?.length) {
          filtered = filtered.filter((c) => filter.loserBrowserIds!.includes(c.loserBrowserId));
        }
        if (filter.createdFrom) {
          filtered = filtered.filter((c) => c.createdAt >= filter.createdFrom!);
        }
        if (filter.createdTo) {
          filtered = filtered.filter((c) => c.createdAt <= filter.createdTo!);
        }
        if (filter.search?.trim()) {
          const q = filter.search.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              c.winnerVersion.title.toLowerCase().includes(q) ||
              c.winnerVersion.url.toLowerCase().includes(q),
          );
        }
        const slice = filtered.slice(offset, offset + limit);
        const hasMore = filtered.length > offset + limit;
        return {
          entries: slice,
          hasMore,
          nextOffset: hasMore ? offset + limit : null,
        };
      },
      getById: async (id) => conflicts.find((c) => c.id === id) ?? null,
      countSinceLastSeen: async () => {
        const since = appState.lastConflictsSeenAt;
        return conflicts.filter(
          (c) => c.status === 'open' && (!since || c.createdAt > since),
        ).length;
      },
      markSeen: async () => {
        appState = { ...appState, lastConflictsSeenAt: new Date().toISOString() };
        persist();
        appStateListeners.forEach((l) => l(appState));
      },
      restore: async (id) => {
        const idx = conflicts.findIndex((c) => c.id === id);
        if (idx < 0) {
          return { ok: false, reason: 'unknown' as const, message: 'Konflikt nicht gefunden.' };
        }
        if (conflicts[idx].status !== 'open') {
          return {
            ok: false,
            reason: 'not-open' as const,
            message: 'Bereits bearbeitet.',
          };
        }
        conflicts = conflicts.map((c, i) =>
          i === idx
            ? { ...c, status: 'restored' as const, resolvedAt: new Date().toISOString() }
            : c,
        );
        conflictListeners.forEach((l) => l());
        return { ok: true };
      },
      dismiss: async (id) => {
        conflicts = conflicts.map((c) =>
          c.id === id
            ? { ...c, status: 'dismissed' as const, resolvedAt: new Date().toISOString() }
            : c,
        );
        conflictListeners.forEach((l) => l());
      },
      subscribe: (l) => {
        conflictListeners.add(l);
        return () => conflictListeners.delete(l);
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
