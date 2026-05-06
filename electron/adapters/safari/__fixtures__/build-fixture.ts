import plist from 'simple-plist';
import { randomUUID } from 'node:crypto';

// Builds a minimal Safari Bookmarks.plist on disk for round-trip tests. The
// shape matches what we observe on real macOS 14-15 installs:
//   top-level: WebBookmarkTypeList with Children = [
//     proxy (History),
//     list "BookmarksBar",
//     list "BookmarksMenu",
//     list "com.apple.ReadingList" with reading-list metadata
//   ]

export type FixtureLeaf = {
  kind: 'leaf';
  uuid?: string;
  title: string;
  url: string;
};

export type FixtureFolder = {
  kind: 'folder';
  uuid?: string;
  title: string;
  children: Array<FixtureLeaf | FixtureFolder>;
};

export type FixtureRoot = {
  bookmarksBar: Array<FixtureLeaf | FixtureFolder>;
  bookmarksMenu: Array<FixtureLeaf | FixtureFolder>;
  /** Provided as raw plist objects so we can verify byte-identical passthrough. */
  readingList?: Array<Record<string, unknown>>;
  /** Extra unknown top-level lists, preserved on write. */
  extraLists?: Array<{ Title: string; Children?: unknown[]; [key: string]: unknown }>;
};

function uuid(seed?: string): string {
  return seed ?? randomUUID().toUpperCase();
}

function leafToPlist(leaf: FixtureLeaf): Record<string, unknown> {
  return {
    WebBookmarkType: 'WebBookmarkTypeLeaf',
    WebBookmarkUUID: uuid(leaf.uuid),
    URLString: leaf.url,
    URIDictionary: { title: leaf.title, '': leaf.url },
  };
}

function folderToPlist(folder: FixtureFolder): Record<string, unknown> {
  return {
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkUUID: uuid(folder.uuid),
    Title: folder.title,
    Children: folder.children.map((c) => (c.kind === 'leaf' ? leafToPlist(c) : folderToPlist(c))),
  };
}

export function buildSafariFixture(plistPath: string, root: FixtureRoot): void {
  const children: Array<Record<string, unknown>> = [];

  // History proxy (always present in real plists)
  children.push({
    WebBookmarkType: 'WebBookmarkTypeProxy',
    WebBookmarkIdentifier: 'History',
    Title: 'History',
  });

  children.push({
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkUUID: uuid('FAVORITES-UUID-0000000000000001'.padEnd(36, '0').slice(0, 36)),
    Title: 'BookmarksBar',
    Children: root.bookmarksBar.map((c) => (c.kind === 'leaf' ? leafToPlist(c) : folderToPlist(c))),
  });

  children.push({
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkUUID: uuid('MENU-UUID-0000000000000001'.padEnd(36, '0').slice(0, 36)),
    Title: 'BookmarksMenu',
    Children: root.bookmarksMenu.map((c) => (c.kind === 'leaf' ? leafToPlist(c) : folderToPlist(c))),
  });

  if (root.readingList) {
    children.push({
      WebBookmarkType: 'WebBookmarkTypeList',
      WebBookmarkUUID: uuid('READINGLIST-UUID-0000000000000001'.padEnd(36, '0').slice(0, 36)),
      Title: 'com.apple.ReadingList',
      Children: root.readingList,
      // Apple stores its reading-list timestamp here; we keep it to verify
      // unknown top-level keys round-trip cleanly.
      ReadingListAutoUpdateLastFetchDate: new Date('2026-04-01T12:00:00Z'),
    });
  }

  if (root.extraLists) {
    for (const extra of root.extraLists) {
      children.push({
        WebBookmarkType: 'WebBookmarkTypeList',
        WebBookmarkUUID: uuid(),
        ...extra,
      });
    }
  }

  const top = {
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkUUID: uuid(),
    WebBookmarkFileVersion: 1,
    Title: '',
    Children: children,
  };

  plist.writeBinaryFileSync(plistPath, top);
}
