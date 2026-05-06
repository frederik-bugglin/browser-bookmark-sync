export type SyncStatus = 'idle' | 'running' | 'success' | 'error';

export type AppState = {
  schemaVersion: 1;
  firstLaunchDone: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  mainWindowBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type Settings = {
  schemaVersion: 1;
  autoLaunch: boolean;
};

export type BrowserId =
  | 'chrome'
  | 'safari'
  | 'firefox'
  | 'arc'
  | 'brave'
  | 'edge'
  | 'zen'
  | 'dia';

export type BrowserStatus = {
  id: BrowserId;
  name: string;
  installed: boolean;
  detected: boolean;
  permissionsOk: boolean;
  enabled: boolean;
};

export type AuthStatus =
  | { state: 'loading' }
  | { state: 'unauthenticated' }
  | { state: 'authenticated'; email: string; userId: string };

export type AuthRequestResult = { ok: true } | { ok: false; message: string };

export type PermissionStatus =
  | 'unknown'      // not yet probed this session
  | 'granted'      // user has approved
  | 'denied'       // probe returned EACCES (TCC blocking)
  | 'unavailable'; // browser not installed / no profile / permission not applicable

export type PermissionsState = {
  safari: PermissionStatus;
};
