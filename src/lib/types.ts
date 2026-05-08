export type SyncStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped-offline';

export type AppState = {
  schemaVersion: 1;
  firstLaunchDone: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  nextScheduledSyncAt: string | null;
  mainWindowBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
};

export type AutoSyncIntervalMin = 5 | 15 | 30 | 60;

export type Settings = {
  schemaVersion: 1 | 2;
  autoLaunch: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMin: AutoSyncIntervalMin;
  notifyOnSyncError: boolean;
  enabledBrowsers: BrowserId[];
  acknowledgedBrowsers: BrowserId[];
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
  acknowledged: boolean;
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

// Sync engine state mirrored from the main process. Keep in sync with
// electron/sync.ts:SyncState and electron/sync-engine/types.ts:SyncRunResult.
export type SyncRunOutcome = 'success' | 'partial' | 'error' | 'skipped';

export type SyncRunSummary = {
  runId: string;
  outcome: SyncRunOutcome;
  durationMs: number;
  conflictsWritten: number;
  cloudBookmarksUpserted: number;
  cloudBookmarksDeleted: number;
  errors: string[];
  safariRaceSuspect?: boolean;
};

export type SyncEngineState = {
  isRunning: boolean;
  lastResult: { runId: string; outcome: SyncRunOutcome; log: SyncRunSummary } | null;
};
