import { computeBookmarkHash } from './identity';
import type { BrowserId, NormalizedBookmark, RootKey } from './types';

// Cross-browser routing for read-only roots.
//
// Each browser has a "support map" telling us which engine RootKey values
// it can write to (writable), which ones exist but are owned by an external
// sync mechanism (readOnly), and which ones it doesn't know about at all
// (everything else, e.g. `mobile`/`menu` for Safari).
//
// When projecting a cloud bookmark for a target browser:
//   1. If the target supports the bookmark's rootKey writably, keep as-is.
//   2. If the target has the rootKey read-only AND already holds the bookmark
//      natively (target in source_browsers), SKIP — don't write a duplicate
//      to the writable area.
//   3. Otherwise reroute to `unfiled` so the bookmark still propagates.

type RootSupport = {
  writable: ReadonlySet<RootKey>;
  readOnly: ReadonlySet<RootKey>;
};

const BROWSER_ROOT_SUPPORT: Record<BrowserId, RootSupport> = {
  safari: {
    writable: new Set<RootKey>(['toolbar', 'unfiled']),
    readOnly: new Set<RootKey>(),
  },
  firefox: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
  zen: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
  // Chromium family writes toolbar/unfiled/menu->other; synced is read-only.
  // The chromium driver maps engine-`menu` -> chromium-`other` (= unfiled),
  // so from the engine's view chromium can absorb `menu` into its unfiled.
  chrome: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
  arc: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
  brave: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
  edge: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
  dia: {
    writable: new Set<RootKey>(['toolbar', 'unfiled', 'menu']),
    readOnly: new Set<RootKey>(['mobile']),
  },
};

export function isReadOnlyRoot(browserId: BrowserId, rootKey: RootKey): boolean {
  return BROWSER_ROOT_SUPPORT[browserId]?.readOnly.has(rootKey) ?? false;
}

export function isWritableRoot(browserId: BrowserId, rootKey: RootKey): boolean {
  return BROWSER_ROOT_SUPPORT[browserId]?.writable.has(rootKey) ?? false;
}

const UNFILED_PATH = '/andere-lesezeichen';

export type RouteDecision =
  | { action: 'keep'; rootKey: RootKey; folderPath: string; hash: string }
  | { action: 'reroute'; rootKey: RootKey; folderPath: string; hash: string }
  | { action: 'skip' };

// Decide what to do with `bookmark` when projecting it for `targetBrowser`.
// `sourceBrowsers` is the cloud row's `source_browsers` array — the list of
// browsers that currently hold this exact hash natively.
export function routeForTarget(
  bookmark: NormalizedBookmark,
  targetBrowser: BrowserId,
  sourceBrowsers: readonly string[] = [],
): RouteDecision {
  // 1) Writable in target -> keep.
  if (isWritableRoot(targetBrowser, bookmark.rootKey)) {
    return {
      action: 'keep',
      rootKey: bookmark.rootKey,
      folderPath: bookmark.folderPath,
      hash: bookmark.urlNormalized
        ? computeBookmarkHash(bookmark.urlNormalized, bookmark.folderPath, bookmark.rootKey)
        : '',
    };
  }

  // 2) Read-only in target AND target already has it natively -> skip.
  // This is the bug fix: previously we would reroute to unfiled, creating
  // a duplicate next to the read-only original.
  if (
    isReadOnlyRoot(targetBrowser, bookmark.rootKey) &&
    sourceBrowsers.includes(targetBrowser)
  ) {
    return { action: 'skip' };
  }

  // 3) Otherwise reroute to unfiled (cross-browser propagation).
  return {
    action: 'reroute',
    rootKey: 'unfiled',
    folderPath: UNFILED_PATH,
    hash: bookmark.urlNormalized
      ? computeBookmarkHash(bookmark.urlNormalized, UNFILED_PATH, 'unfiled')
      : '',
  };
}

// Adapt a cloud bookmark to the snapshot a specific target browser should
// receive. Returns null if the bookmark should be skipped for this target
// (already there natively in a read-only root).
export function projectForBrowser(
  bookmark: NormalizedBookmark,
  targetBrowser: BrowserId,
  sourceBrowsers: readonly string[] = [],
): NormalizedBookmark | null {
  const route = routeForTarget(bookmark, targetBrowser, sourceBrowsers);
  if (route.action === 'skip') return null;
  if (route.action === 'keep') return bookmark;
  return {
    ...bookmark,
    rootKey: route.rootKey,
    folderPath: route.folderPath,
  };
}
