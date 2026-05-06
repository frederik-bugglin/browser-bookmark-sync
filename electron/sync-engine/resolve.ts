import { bookmarkToUpsert, type BookmarkUpsert } from './cloud';
import { sourceBrowsersFor } from './diff';
import type {
  BookmarkChange,
  BrowserId,
  CloudBookmark,
  ConflictLogInsert,
  NormalizedBookmark,
} from './types';

// LWW resolution.
//
// Inputs: per-browser changes (from diff.ts), the current cloud state, and
// the per-browser current snapshots (used to compute the new source_browsers
// array on the cloud row).
//
// Outputs:
//  - upserts: rows to insert/update in bookmarks_cloud
//  - deletes: hashes to remove from bookmarks_cloud
//  - conflicts: rows to insert into conflict_log (one per losing browser)

export type ResolveInput = {
  userId: string;
  syncRunId: string;
  syncRunAt: string;
  changesByBrowser: Map<BrowserId, BookmarkChange[]>;
  cloudByHash: Map<string, CloudBookmark>;
  currentByBrowser: Map<BrowserId, Map<string, NormalizedBookmark>>;
};

export type ResolveOutput = {
  upserts: BookmarkUpsert[];
  deletes: string[];
  conflicts: ConflictLogInsert[];
};

type CandidateChange = {
  browserId: BrowserId;
  change: BookmarkChange;
};

// A bookmark's effective dateModified when LWW compares: prefer the value the
// browser supplied; fall back to the sync-run time if missing (Safari).
function effectiveDateMs(change: BookmarkChange, syncRunAt: string): number {
  const dt = change.value.dateModified ?? syncRunAt;
  const ms = Date.parse(dt);
  return Number.isFinite(ms) ? ms : Date.parse(syncRunAt);
}

// Compare two candidates. Returns positive if A wins, negative if B wins,
// 0 only on absolute tie -- which we resolve alphabetically by browserId.
function compareCandidates(
  a: CandidateChange,
  b: CandidateChange,
  syncRunAt: string,
): number {
  // Updated/added always beat deleted: an explicit edit is more intentional
  // than an absence, and an absence-vs-edit would otherwise lose the user's
  // edit silently.
  const aIsDelete = a.change.kind === 'deleted';
  const bIsDelete = b.change.kind === 'deleted';
  if (aIsDelete && !bIsDelete) return -1;
  if (!aIsDelete && bIsDelete) return 1;

  const aMs = effectiveDateMs(a.change, syncRunAt);
  const bMs = effectiveDateMs(b.change, syncRunAt);
  if (aMs !== bMs) return aMs - bMs;
  // Tie-break: alphabetic browserId order, deterministic.
  return a.browserId < b.browserId ? -1 : a.browserId > b.browserId ? 1 : 0;
}

export function resolve(input: ResolveInput): ResolveOutput {
  const upserts: BookmarkUpsert[] = [];
  const deletes: string[] = [];
  const conflicts: ConflictLogInsert[] = [];

  // Group changes by hash.
  const changesByHash = new Map<string, CandidateChange[]>();
  for (const [browserId, changes] of input.changesByBrowser) {
    for (const change of changes) {
      const list = changesByHash.get(change.hash);
      if (list) list.push({ browserId, change });
      else changesByHash.set(change.hash, [{ browserId, change }]);
    }
  }

  for (const [hash, candidates] of changesByHash) {
    // Sort: best candidate last (so .pop() gives us the winner).
    const sorted = [...candidates].sort((a, b) => compareCandidates(a, b, input.syncRunAt));
    const winner = sorted[sorted.length - 1];
    const losers = sorted.slice(0, -1);

    // Conflict only if losers actually disagree with the winner. If two
    // browsers made the *same* change ("updated to title X"), that's not
    // a conflict, it's just two sources confirming each other. We compare
    // the resulting bookmark values for relevant differences.
    for (const loser of losers) {
      if (changeProducesSameOutcome(winner.change, loser.change)) continue;
      conflicts.push({
        user_id: input.userId,
        bookmark_hash: hash,
        winner_version: winner.change.value,
        loser_version: loser.change.value,
        winner_browser_id: winner.browserId,
        loser_browser_id: loser.browserId,
        sync_run_id: input.syncRunId,
      });
    }

    // Apply the winner: delete or upsert.
    if (winner.change.kind === 'deleted') {
      deletes.push(hash);
    } else {
      const sourceBrowsers = sourceBrowsersFor(hash, input.currentByBrowser);
      upserts.push(bookmarkToUpsert(winner.change.value, hash, sourceBrowsers));
    }
  }

  return { upserts, deletes, conflicts };
}

// Two changes "produce the same outcome" when both are deletes, or both are
// adds/updates with identical user-visible content (title in MVP).
function changeProducesSameOutcome(a: BookmarkChange, b: BookmarkChange): boolean {
  if (a.kind === 'deleted' && b.kind === 'deleted') return true;
  if (a.kind === 'deleted' || b.kind === 'deleted') return false;
  return a.value.title === b.value.title;
}
