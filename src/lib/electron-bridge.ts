import type {
  AppState,
  AuthRequestResult,
  AuthStatus,
  PermissionStatus,
  PermissionsState,
  Settings,
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
  mainWindowBounds: null,
};

const FALLBACK_SETTINGS: Settings = {
  schemaVersion: 1,
  autoLaunch: true,
};

const FALLBACK_PERMISSIONS: PermissionsState = {
  safari: 'unknown',
};

function createMockBridge(): Bridge {
  let appState = { ...FALLBACK_APP_STATE };
  let settings = { ...FALLBACK_SETTINGS };
  let authStatus: AuthStatus = { state: 'unauthenticated' };
  let permissions: PermissionsState = { ...FALLBACK_PERMISSIONS };
  const appStateListeners = new Set<(s: AppState) => void>();
  const settingsListeners = new Set<(s: Settings) => void>();
  const authListeners = new Set<(s: AuthStatus) => void>();
  const permissionListeners = new Set<(s: PermissionsState) => void>();
  // First probe in the mock returns 'denied' (simulates the typical first-run
  // state). Each "I granted it" press flips to 'granted'.
  let mockSafariProbeCount = 0;

  return {
    appState: {
      get: async () => appState,
      set: async (patch) => {
        appState = { ...appState, ...patch };
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
