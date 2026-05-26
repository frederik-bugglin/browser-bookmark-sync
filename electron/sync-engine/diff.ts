import { bookmarksDiffer, hashOf } from './identity';
import type {
  BookmarkChange,
  BrowserId,
  NormalizedBookmark,
  NormalizedSnapshot,
} from './types';

// 3-way diff for one browser.
//
// Given the last-known-snapshot of this browser (or null if there's never
// been one) and the just-read current snapshot, return what the user did
// to this browser since: adds, updates, deletes.
//
// Identity is the bookmark hash. Folders are not produced as changes --
// the engine derives folder presence from bookmark folderPaths.

export function diffBrowserSnapshot(
  previous: NormalizedSnapshot | null,
  current: NormalizedSnapshot,
  syncRunAt?: string,
): BookmarkChange[] {
  const changes: BookmarkChange[] = [];
  const previousByHash = indexByHash(previous?.bookmarks ?? []);
  const currentByHash = indexByHash(current.bookmarks);

  // adds + updates
  for (const [hash, currentBm] of currentByHash) {
    const prevBm = previousByHash.get(hash);
    if (!prevBm) {
      changes.push({ kind: 'added', hash, value: stampIfMissing(currentBm, syncRunAt) });
      continue;
    }
    if (bookmarksDiffer(prevBm, currentBm)) {
      changes.push({ kind: 'updated', hash, value: stampIfMissing(currentBm, syncRunAt) });
    }
  }

  // deletes
  for (const [hash, prevBm] of previousByHash) {
    if (!currentByHash.has(hash)) {
      changes.push({ kind: 'deleted', hash, value: prevBm });
    }
  }

  return changes;
}

// Chromium does not persist a per-URL date_modified — every bookmark from
// Chrome/Brave/Edge/Arc comes back with dateModified=null. Without a
// timestamp the LWW resolver can't pick a winner on merit and falls back
// to alphabetic browserId order, and the conflict-detail UI shows '—'.
// Stamping at change-detection time means: if we noticed a difference,
// the user changed it now — record that.
function stampIfMissing(bm: NormalizedBookmark, syncRunAt: string | undefined): NormalizedBookmark {
  if (bm.dateModified || !syncRunAt) return bm;
  return { ...bm, dateModified: syncRunAt };
}

export function indexByHash(bookmarks: NormalizedBookmark[]): Map<string, NormalizedBookmark> {
  const out = new Map<string, NormalizedBookmark>();
  for (const b of bookmarks) {
    out.set(hashOf(b), b);
  }
  return out;
}

// Helper for the resolve step: which browsers currently report this hash.
// Used to build the source_browsers array on the cloud row.
export function sourceBrowsersFor(
  hash: string,
  currentByBrowser: Map<BrowserId, Map<string, NormalizedBookmark>>,
): BrowserId[] {
  const out: BrowserId[] = [];
  for (const [browserId, bookmarks] of currentByBrowser) {
    if (bookmarks.has(hash)) out.push(browserId);
  }
  return out.sort();
}
