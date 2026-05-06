import { computeBookmarkHash } from './identity';
import type { BrowserId, NormalizedBookmark, RootKey } from './types';

// Cross-browser routing for read-only roots.
//
// Chromium's `synced` (Chrome Sync) and Firefox's `mobile` (Firefox Sync) are
// adapter-readable but not writable. Bookmarks in those roots get propagated
// to OTHER browsers, but the target's mobile/synced root is also untouchable
// (Apple/Google reserve them). So the engine reroutes them into the target
// browser's `unfiled` root -- the soft trash bin for unsorted items, and the
// only place that's safe to receive cross-browser arrivals.
//
// We never route INTO toolbar: toolbar is a curated visual shelf and stuffing
// 200 mobile bookmarks there would horrify the user.

// Browsers whose `mobile`/`synced` roots are read-only.
const READ_ONLY_FAMILIES: Record<BrowserId, RootKey[]> = {
  safari: [],
  firefox: ['mobile'],
  zen: ['mobile'],
  chrome: ['mobile'],
  arc: ['mobile'],
  brave: ['mobile'],
  edge: ['mobile'],
  dia: ['mobile'],
};

export function isReadOnlyRoot(browserId: BrowserId, rootKey: RootKey): boolean {
  return READ_ONLY_FAMILIES[browserId]?.includes(rootKey) ?? false;
}

// Where should a bookmark with `originalRootKey` from `sourceBrowser` land
// when written into `targetBrowser`? Returns the target root and the
// rewritten folder path. If the source's root is writable in the target,
// the path is unchanged. If not, we land in `/andere-lesezeichen` (the
// canonical unfiled path used by all adapters' ROOT_TO_PATH).
const UNFILED_PATH = '/andere-lesezeichen';

export function routeForTarget(
  bookmark: NormalizedBookmark,
  targetBrowser: BrowserId,
): { rootKey: RootKey; folderPath: string; hash: string } {
  // If the bookmark's home root is writable in the target, leave it alone.
  if (!isReadOnlyRoot(targetBrowser, bookmark.rootKey)) {
    return {
      rootKey: bookmark.rootKey,
      folderPath: bookmark.folderPath,
      hash: bookmark.urlNormalized
        ? computeBookmarkHash(bookmark.urlNormalized, bookmark.folderPath, bookmark.rootKey)
        : '',
    };
  }

  // Mobile / synced -> unfiled at the target.
  return {
    rootKey: 'unfiled',
    folderPath: UNFILED_PATH,
    hash: bookmark.urlNormalized
      ? computeBookmarkHash(bookmark.urlNormalized, UNFILED_PATH, 'unfiled')
      : '',
  };
}

// Adapt a cloud bookmark to the snapshot a specific target browser should
// receive. Used in the WRITE phase.
export function projectForBrowser(
  bookmark: NormalizedBookmark,
  targetBrowser: BrowserId,
): NormalizedBookmark {
  const route = routeForTarget(bookmark, targetBrowser);
  if (route.rootKey === bookmark.rootKey && route.folderPath === bookmark.folderPath) {
    return bookmark;
  }
  return {
    ...bookmark,
    rootKey: route.rootKey,
    folderPath: route.folderPath,
  };
}
