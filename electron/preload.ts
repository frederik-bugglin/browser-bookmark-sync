import { contextBridge, ipcRenderer } from 'electron';
import type { AppState, Settings } from './state';
import type { AuthStatus } from './auth';

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
  app: {
    quit: () => ipcRenderer.invoke('app:quit'),
    openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
    platform: () => process.platform,
  },
};

contextBridge.exposeInMainWorld('junction', bridge);
