// All RootKey values share the same string set across adapters; we redeclare
// here so the engine doesn't depend on any single adapter's types module.
export type RootKey = 'toolbar' | 'unfiled' | 'mobile' | 'menu';

export type BrowserId =
  | 'safari'
  | 'firefox'
  | 'zen'
  | 'chrome'
  | 'arc'
  | 'brave'
  | 'edge'
  | 'dia';

export type NormalizedFolder = {
  id: string;
  name: string;
  pathNormalized: string;
  parentPath: string | null;
  rootKey: RootKey;
  dateAdded: string | null;
  dateModified: string | null;
};

export type NormalizedBookmark = {
  id: string;
  url: string;
  urlNormalized: string;
  title: string;
  folderPath: string;
  rootKey: RootKey;
  dateAdded: string | null;
  dateModified: string | null;
};

export type NormalizedSnapshot = {
  browserId: string;
  folders: NormalizedFolder[];
  bookmarks: NormalizedBookmark[];
};

// Cloud-side row shapes. Mirror the SQL columns from 0002_sync_engine.sql.
export type CloudBookmark = {
  id: string;
  user_id: string;
  bookmark_hash: string;
  url: string;
  url_normalized: string;
  title: string;
  folder_path: string;
  root_key: RootKey;
  source_browsers: string[];
  date_added: string | null;
  date_modified: string | null;
  updated_at: string;
};

export type CloudSnapshot = {
  user_id: string;
  browser_id: BrowserId;
  snapshot_json: NormalizedSnapshot;
  sync_run_id: string;
  captured_at: string;
};

export type ConflictLogInsert = {
  user_id: string;
  bookmark_hash: string;
  winner_version: NormalizedBookmark;
  loser_version: NormalizedBookmark;
  winner_browser_id: BrowserId;
  loser_browser_id: BrowserId;
  sync_run_id: string;
  // status, created_at, resolved_at, restore_origin_id default to open/now/null/null.
};

// What kind of change a single browser made to one bookmark since its last
// known snapshot. The 3-way diff produces a list of these per browser.
export type BookmarkChangeKind = 'added' | 'updated' | 'deleted';

export type BookmarkChange = {
  kind: BookmarkChangeKind;
  hash: string;
  // For added/updated: the new value. For deleted: the value that was there
  // last time (so we can write it into the conflict log if a write-write
  // collision wins on the other side).
  value: NormalizedBookmark;
};

// Eligibility decision for one browser, made in the PLAN phase.
export type EligibleBrowser = {
  browserId: BrowserId;
  reason: 'eligible';
  // When true the engine reads the browser but skips the write phase.
  // Used for adapters that can snapshot a running browser (copy-then-read)
  // but cannot safely write while the profile lock is held — Firefox/Zen.
  readOnly?: boolean;
  detail?: string;
};

export type IneligibleBrowser = {
  browserId: BrowserId;
  reason:
    | 'not-installed'
    | 'no-default-profile'
    | 'permission-denied'
    | 'browser-running-write'
    | 'deactivated'
    | 'unknown';
  detail?: string;
};

export type BrowserPlan = EligibleBrowser | IneligibleBrowser;

// One sync-run from start to finish. Persisted to disk as JSON.
export type SyncRunOutcome = 'success' | 'partial' | 'error' | 'skipped';

export type AdapterPhaseLog = {
  browserId: BrowserId;
  phase: 'read' | 'write' | 'reread';
  durationMs: number;
  bookmarksRead?: number;
  bookmarksWritten?: number;
  error?: string;
};

export type SyncRunLog = {
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  outcome: SyncRunOutcome;
  triggeredBy: 'manual' | 'auto' | 'restore';
  plan: BrowserPlan[];
  phases: AdapterPhaseLog[];
  conflictsWritten: number;
  cloudBookmarksUpserted: number;
  cloudBookmarksDeleted: number;
  errors: string[];
  // Set when Safari Re-Read showed a diff to the just-written state.
  safariRaceSuspect?: boolean;
};

export type SyncRunResult = {
  runId: string;
  outcome: SyncRunOutcome;
  log: SyncRunLog;
};

// Engine-level errors (not adapter or cloud errors which keep their own
// types). Used for things like "no authenticated session".
export class SyncEngineError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SyncEngineError';
  }
}
