import type { RootKey } from './types';

// Safari's two top-level lists. We mirror the same internal paths as Firefox
// and Chromium so the sync engine sees one shape across every browser family.
//
// Safari has no `mobile`/`synced` equivalent because iCloud syncs the same
// plist file directly to iOS Safari — that propagation happens at the OS
// level, not via a separate "synced" bucket.
export const SAFARI_TITLE_TO_ROOT: Record<string, RootKey> = {
  BookmarksBar: 'toolbar',
  BookmarksMenu: 'unfiled',
};

export const ROOT_TO_SAFARI_TITLE: Partial<Record<RootKey, string>> = {
  toolbar: 'BookmarksBar',
  unfiled: 'BookmarksMenu',
};

export const ROOT_TO_PATH: Record<RootKey, string> = {
  toolbar: '/lesezeichenleiste',
  unfiled: '/andere-lesezeichen',
  mobile: '/synchronisiert',
  menu: '/lesezeichen-menu',
};

export const PATH_TO_ROOT: Record<string, RootKey> = Object.fromEntries(
  Object.entries(ROOT_TO_PATH).map(([key, value]) => [value, key as RootKey]),
);

// Junction never writes Safari's `mobile` or `menu` paths (Safari has no
// equivalent storage). The sync engine routes those buckets to other adapters.
export const SAFARI_ROOTS: ReadonlySet<RootKey> = new Set<RootKey>(['toolbar', 'unfiled']);

// Reading List is a separate Safari concept (saved articles with read state
// and offline cache). It lives as a sibling list under the same plist root,
// titled `com.apple.ReadingList`. Junction must never read or modify it.
export const READING_LIST_TITLE = 'com.apple.ReadingList';

export function rootKeyForPath(folderPath: string): RootKey | null {
  if (!folderPath || folderPath === '/') return null;
  for (const [path, key] of Object.entries(PATH_TO_ROOT)) {
    if (folderPath === path || folderPath.startsWith(`${path}/`)) {
      return key;
    }
  }
  return null;
}

export function isSafariSyncableRoot(key: RootKey): boolean {
  return SAFARI_ROOTS.has(key);
}
