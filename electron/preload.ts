import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, BrowserId, Settings } from './state';
import type { AuthStatus } from './auth';
import type { PermissionStatus, PermissionsState } from './permissions';
import type { SyncState } from './sync';
import type { SyncRunResult } from './sync-engine';
import type { BrowserStatus } from './browsers';
import type {
  ConflictEntry,
  ConflictFilter,
  ConflictListResult,
  RestoreResult,
} from './conflicts/types';

export type AuthRequestResult = { ok: true } | { ok: false; message: string };

export type JunctionBridge = {
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
    getState: () => Promise<SyncState>;
    run: (triggeredBy: 'manual' | 'auto' | 'restore') => Promise<SyncRunResult>;
    awaitIdle: () => Promise<void>;
    subscribe: (listener: (state: SyncState) => void) => () => void;
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

const bridge: JunctionBridge = {
  appState: {
    get: () => ipcRenderer.invoke('app:state:get'),
    set: (patch) => ipcRenderer.invoke('app:state:set', patch),
    subscribe: (listener) => {
      const handler = (_: unknown, state: AppState) => listener(state);
      ipcRenderer.on('app:state:changed', handler);
      return () => ipcRenderer.removeListener('app:state:changed', handler);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    subscribe: (listener) => {
      const handler = (_: unknown, settings: Settings) => listener(settings);
      ipcRenderer.on('settings:changed', handler);
      return () => ipcRenderer.removeListener('settings:changed', handler);
    },
  },
  window: {
    showMain: () => ipcRenderer.invoke('window:show-main'),
    hidePopover: () => ipcRenderer.invoke('window:hide-popover'),
    showOnboarding: () => ipcRenderer.invoke('window:show-onboarding'),
  },
  auth: {
    getStatus: () => ipcRenderer.invoke('auth:status:get'),
    requestMagicLink: (email) => ipcRenderer.invoke('auth:request-magic-link', email),
    signOut: () => ipcRenderer.invoke('auth:sign-out'),
    subscribe: (listener) => {
      const handler = (_: unknown, status: AuthStatus) => listener(status);
      ipcRenderer.on('auth:status:changed', handler);
      return () => ipcRenderer.removeListener('auth:status:changed', handler);
    },
  },
  permissions: {
    getState: () => ipcRenderer.invoke('permissions:state:get'),
    probeSafari: () => ipcRenderer.invoke('permissions:probe-safari'),
    openSafariSettings: () => ipcRenderer.invoke('permissions:open-safari-settings'),
    subscribe: (listener) => {
      const handler = (_: unknown, state: PermissionsState) => listener(state);
      ipcRenderer.on('permissions:state:changed', handler);
      return () => ipcRenderer.removeListener('permissions:state:changed', handler);
    },
  },
  sync: {
    getState: () => ipcRenderer.invoke('sync:state:get'),
    run: (triggeredBy) => ipcRenderer.invoke('sync:run', triggeredBy),
    awaitIdle: () => ipcRenderer.invoke('sync:await-idle'),
    subscribe: (listener) => {
      const handler = (_: unknown, state: SyncState) => listener(state);
      ipcRenderer.on('sync:state:changed', handler);
      return () => ipcRenderer.removeListener('sync:state:changed', handler);
    },
  },
  browsers: {
    list: () => ipcRenderer.invoke('browsers:list'),
    refresh: () => ipcRenderer.invoke('browsers:refresh'),
    setEnabled: (browserId, enabled) =>
      ipcRenderer.invoke('browsers:set-enabled', browserId, enabled),
    acknowledge: (browserId) => ipcRenderer.invoke('browsers:acknowledge', browserId),
    openPermissions: (browserId) =>
      ipcRenderer.invoke('browsers:open-permissions', browserId),
    subscribe: (listener) => {
      const handler = (_: unknown, list: BrowserStatus[]) => listener(list);
      ipcRenderer.on('browsers:changed', handler);
      return () => ipcRenderer.removeListener('browsers:changed', handler);
    },
  },
  conflicts: {
    list: (filter) => ipcRenderer.invoke('conflicts:list', filter),
    getById: (id) => ipcRenderer.invoke('conflicts:get-by-id', id),
    countSinceLastSeen: () => ipcRenderer.invoke('conflicts:count-since-last-seen'),
    markSeen: () => ipcRenderer.invoke('conflicts:mark-seen'),
    restore: (id) => ipcRenderer.invoke('conflicts:restore', id),
    dismiss: (id) => ipcRenderer.invoke('conflicts:dismiss', id),
    subscribe: (listener) => {
      const handler = () => listener();
      ipcRenderer.on('conflicts:changed', handler);
      return () => ipcRenderer.removeListener('conflicts:changed', handler);
    },
  },
  app: {
    quit: () => ipcRenderer.invoke('app:quit'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    platform: () => process.platform,
  },
};

contextBridge.exposeInMainWorld('junction', bridge);
