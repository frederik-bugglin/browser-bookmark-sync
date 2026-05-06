import { randomUUID } from 'node:crypto';
import { assertBrowserId } from './browser-id';
import { cloudToNormalized, type CloudClient } from './cloud';
import { diffBrowserSnapshot, indexByHash } from './diff';
import { hashOf } from './identity';
import { writeRunLog, type LogStore } from './log';
import { resolve as resolveChanges } from './resolve';
import { projectForBrowser } from './route';
import type { BrowserDriver } from './drivers';
import type {
  AdapterPhaseLog,
  BookmarkChange,
  BrowserId,
  BrowserPlan,
  EligibleBrowser,
  NormalizedBookmark,
  NormalizedSnapshot,
  SyncRunLog,
  SyncRunOutcome,
  SyncRunResult,
} from './types';

export type PipelineDeps = {
  userId: string;
  cloud: CloudClient;
  drivers: BrowserDriver[];
  logStore: LogStore;
  /** "manual" (user clicked sync), "auto" (timer triggered), "restore" (PROJ-9 restore action). */
  triggeredBy: 'manual' | 'auto' | 'restore';
  /** Optional injection for tests; defaults to new Date(). */
  now?: () => Date;
};

export async function runPipeline(deps: PipelineDeps): Promise<SyncRunResult> {
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const runId = randomUUID();
  const phases: AdapterPhaseLog[] = [];
  const errors: string[] = [];
  let outcome: SyncRunOutcome = 'success';
  let safariRaceSuspect: boolean | undefined;

  // -------- Phase 1: PLAN --------
  const planResults: BrowserPlan[] = deps.drivers.map((d) => d.plan());
  const eligible = planResults.filter(
    (p): p is EligibleBrowser => p.reason === 'eligible',
  );
  if (eligible.length === 0) {
    return finish('skipped', 'No eligible browsers');
  }

  // -------- Phase 2: READ --------
  const currentByBrowser = new Map<BrowserId, Map<string, NormalizedBookmark>>();
  const currentSnapshots = new Map<BrowserId, NormalizedSnapshot>();
  const readableBrowsers: EligibleBrowser[] = [];

  for (const browserPlan of eligible) {
    const driver = findDriver(deps.drivers, browserPlan.browserId);
    if (!driver) continue;
    const t0 = Date.now();
    try {
      const snapshot = driver.read();
      const dt = Date.now() - t0;
      currentSnapshots.set(browserPlan.browserId, snapshot);
      currentByBrowser.set(browserPlan.browserId, indexByHash(snapshot.bookmarks));
      readableBrowsers.push(browserPlan);
      phases.push({
        browserId: browserPlan.browserId,
        phase: 'read',
        durationMs: dt,
        bookmarksRead: snapshot.bookmarks.length,
      });
    } catch (err) {
      const dt = Date.now() - t0;
      const msg = (err as Error).message ?? String(err);
      errors.push(`read ${browserPlan.browserId}: ${msg}`);
      outcome = 'partial';
      phases.push({
        browserId: browserPlan.browserId,
        phase: 'read',
        durationMs: dt,
        error: msg,
      });
    }
  }

  if (readableBrowsers.length === 0) {
    return finish('error', 'All reads failed');
  }

  // -------- Phase 3: DIFF (per browser, against last-known-snapshot) --------
  const changesByBrowser = new Map<BrowserId, BookmarkChange[]>();
  for (const browserPlan of readableBrowsers) {
    const previous = await deps.cloud.fetchSnapshot(deps.userId, browserPlan.browserId);
    const current = currentSnapshots.get(browserPlan.browserId)!;
    const changes = previous
      ? diffBrowserSnapshot(previous, current)
      : // First sync for this browser: treat all current bookmarks as adds.
        diffBrowserSnapshot(null, current);
    changesByBrowser.set(browserPlan.browserId, changes);
  }

  // -------- Phase 4: RESOLVE --------
  const cloudRows = await deps.cloud.fetchBookmarksCloud(deps.userId);
  const cloudByHash = new Map(cloudRows.map((r) => [r.bookmark_hash, r]));

  const resolved = resolveChanges({
    userId: deps.userId,
    syncRunId: runId,
    syncRunAt: startedAt.toISOString(),
    changesByBrowser,
    cloudByHash,
    currentByBrowser,
  });

  // -------- Phase 5: WRITE CLOUD --------
  if (resolved.upserts.length > 0) {
    await deps.cloud.upsertBookmarksCloud(deps.userId, resolved.upserts);
  }
  if (resolved.deletes.length > 0) {
    await deps.cloud.deleteBookmarksCloud(deps.userId, resolved.deletes);
  }
  if (resolved.conflicts.length > 0) {
    await deps.cloud.insertConflictLog(resolved.conflicts);
  }

  // The merged cloud state, used to project per-browser snapshots in WRITE.
  const mergedCloud = computeMergedCloud(cloudRows, resolved);

  // -------- Phase 6: WRITE ADAPTERS --------
  const writeOk = new Set<BrowserId>();
  for (const browserPlan of readableBrowsers) {
    const driver = findDriver(deps.drivers, browserPlan.browserId);
    if (!driver) continue;
    const targetSnapshot = projectSnapshotFor(driver.browserId, mergedCloud);
    const t0 = Date.now();
    try {
      driver.write(targetSnapshot);
      const dt = Date.now() - t0;
      writeOk.add(browserPlan.browserId);
      phases.push({
        browserId: browserPlan.browserId,
        phase: 'write',
        durationMs: dt,
        bookmarksWritten: targetSnapshot.bookmarks.length,
      });
    } catch (err) {
      const dt = Date.now() - t0;
      const msg = (err as Error).message ?? String(err);
      errors.push(`write ${browserPlan.browserId}: ${msg}`);
      outcome = 'partial';
      phases.push({
        browserId: browserPlan.browserId,
        phase: 'write',
        durationMs: dt,
        error: msg,
      });
    }
  }

  // -------- Phase 7: RE-READ SAFARI --------
  if (writeOk.has('safari')) {
    const safariDriver = findDriver(deps.drivers, 'safari');
    if (safariDriver?.reread) {
      const t0 = Date.now();
      try {
        const reread = safariDriver.reread();
        const dt = Date.now() - t0;
        const expected = projectSnapshotFor('safari', mergedCloud);
        const expectedHashes = new Set(expected.bookmarks.map((b) => hashOf(b)));
        const actualHashes = new Set(reread.bookmarks.map((b) => hashOf(b)));
        const matches =
          expectedHashes.size === actualHashes.size &&
          [...expectedHashes].every((h) => actualHashes.has(h));
        safariRaceSuspect = !matches;
        phases.push({
          browserId: 'safari',
          phase: 'reread',
          durationMs: dt,
          bookmarksRead: reread.bookmarks.length,
        });
        if (!matches) {
          errors.push('safari race suspect: re-read shows divergent bookmark set');
          if (outcome === 'success') outcome = 'partial';
        }
      } catch (err) {
        const dt = Date.now() - t0;
        const msg = (err as Error).message ?? String(err);
        errors.push(`reread safari: ${msg}`);
        phases.push({
          browserId: 'safari',
          phase: 'reread',
          durationMs: dt,
          error: msg,
        });
      }
    }
  }

  // -------- Phase 8: PERSIST SNAPSHOTS --------
  for (const browserId of writeOk) {
    const targetSnapshot = projectSnapshotFor(browserId, mergedCloud);
    try {
      await deps.cloud.saveSnapshot({
        userId: deps.userId,
        browserId: assertBrowserId(browserId),
        snapshot: targetSnapshot,
        syncRunId: runId,
      });
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      errors.push(`saveSnapshot ${browserId}: ${msg}`);
      outcome = 'partial';
    }
  }

  return finish(outcome);

  // ----------------------------------------------------------------------

  function finish(finalOutcome: SyncRunOutcome, skipReason?: string): SyncRunResult {
    if (skipReason) errors.push(skipReason);
    const endedAt = now();
    const log: SyncRunLog = {
      runId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      outcome: finalOutcome,
      triggeredBy: deps.triggeredBy,
      plan: planResults,
      phases,
      conflictsWritten: 0, // filled below if we got past resolve
      cloudBookmarksUpserted: 0,
      cloudBookmarksDeleted: 0,
      errors,
      safariRaceSuspect,
    };
    // resolved is undefined if we bailed before resolve; capture if available.
    try {
      log.conflictsWritten = resolved?.conflicts.length ?? 0;
      log.cloudBookmarksUpserted = resolved?.upserts.length ?? 0;
      log.cloudBookmarksDeleted = resolved?.deletes.length ?? 0;
    } catch {
      // resolved not in scope yet; leave zeros
    }
    try {
      writeRunLog(deps.logStore, log);
    } catch {
      // logging is best-effort, never fail the sync because of disk
    }
    return { runId, outcome: finalOutcome, log };
  }
}

function findDriver(drivers: BrowserDriver[], browserId: BrowserId): BrowserDriver | null {
  return drivers.find((d) => d.browserId === browserId) ?? null;
}

// Apply the resolved upserts/deletes onto the cloud rows snapshot to get the
// merged state for the WRITE phase. We don't re-fetch from Supabase because
// we already know exactly what we just wrote.
function computeMergedCloud(
  before: import('./types').CloudBookmark[],
  resolved: ReturnType<typeof resolveChanges>,
): NormalizedBookmark[] {
  const merged = new Map<string, NormalizedBookmark>();
  for (const row of before) {
    merged.set(row.bookmark_hash, cloudToNormalized(row));
  }
  for (const u of resolved.upserts) {
    merged.set(u.bookmark_hash, {
      id: u.bookmark_hash,
      url: u.url,
      urlNormalized: u.url_normalized,
      title: u.title,
      folderPath: u.folder_path,
      rootKey: u.root_key,
      dateAdded: u.date_added,
      dateModified: u.date_modified,
    });
  }
  for (const hash of resolved.deletes) {
    merged.delete(hash);
  }
  return Array.from(merged.values());
}

// Project the merged cloud state into a snapshot suitable for one specific
// target browser. Read-only-root bookmarks get rerouted into unfiled, the
// rest stay as-is.
function projectSnapshotFor(
  browserId: BrowserId,
  merged: NormalizedBookmark[],
): NormalizedSnapshot {
  const bookmarks = merged.map((b) => projectForBrowser(b, browserId));
  return {
    browserId,
    folders: synthesizeFoldersFrom(bookmarks),
    bookmarks,
  };
}

// Adapters consume folders to know which directory to create. We synthesize
// folder records from the unique folderPaths in the bookmarks list. The
// adapters' write functions only require id/name/pathNormalized/parentPath/
// rootKey; date fields are nullable.
function synthesizeFoldersFrom(bookmarks: NormalizedBookmark[]): import('./types').NormalizedFolder[] {
  const seen = new Set<string>();
  const out: import('./types').NormalizedFolder[] = [];
  for (const b of bookmarks) {
    let path = b.folderPath;
    while (path && path !== '/' && !seen.has(path)) {
      seen.add(path);
      const lastSlash = path.lastIndexOf('/');
      const parentPath = lastSlash <= 0 ? null : path.slice(0, lastSlash);
      const name = path.slice(lastSlash + 1);
      out.push({
        id: path,
        name,
        pathNormalized: path,
        parentPath,
        rootKey: b.rootKey,
        dateAdded: null,
        dateModified: null,
      });
      if (!parentPath) break;
      path = parentPath;
    }
  }
  return out;
}
