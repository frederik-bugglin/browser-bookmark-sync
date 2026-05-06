import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import plist from 'simple-plist';
import { app } from 'electron';
import { checkSafariRunning } from './lock';
import { parseSafariPlist, type SafariRoot } from './read';
import {
  READING_LIST_TITLE,
  ROOT_TO_PATH,
  ROOT_TO_SAFARI_TITLE,
  SAFARI_ROOTS,
  isSafariSyncableRoot,
} from './mapping';
import {
  BrowserRunningError,
  SafariParseError,
  SafariPermissionError,
  type NormalizedBookmark,
  type NormalizedFolder,
  type NormalizedSnapshot,
  type RootKey,
} from './types';

const MAX_BACKUPS = 3;

type ListItem = {
  WebBookmarkType: 'WebBookmarkTypeList';
  WebBookmarkUUID: string;
  Title: string;
  Children: PlistChild[];
};

type LeafItem = {
  WebBookmarkType: 'WebBookmarkTypeLeaf';
  WebBookmarkUUID: string;
  URLString: string;
  URIDictionary: { title: string; '': string };
};

type PlistChild = ListItem | LeafItem | { WebBookmarkType: string; [key: string]: unknown };

function backupDir(browserId: string, userDataDir?: string): string {
  const root = userDataDir ?? (app?.getPath ? app.getPath('userData') : '/tmp/junction-userdata-fallback');
  const dir = path.join(root, 'backups', 'safari', browserId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function rotateBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('Bookmarks.') && f.endsWith('.plist'))
    .sort();
  while (files.length >= MAX_BACKUPS) {
    const oldest = files.shift();
    if (oldest) {
      try {
        unlinkSync(path.join(dir, oldest));
      } catch {
        // ignore
      }
    }
  }
}

function backupPlist(browserId: string, plistPath: string, userDataDir?: string): void {
  if (!existsSync(plistPath)) return;
  const dir = backupDir(browserId, userDataDir);
  rotateBackups(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(plistPath, path.join(dir, `Bookmarks.${ts}.plist`));
}

// Safari UUIDs in the wild are uppercase 36-char with hyphens. We use that
// shape so a written plist round-trips byte-for-byte close enough for Safari
// not to flag ours as foreign.
function makeUuid(snapshotId: string | undefined): string {
  if (snapshotId && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/.test(snapshotId)) {
    return snapshotId;
  }
  return randomUUID().toUpperCase();
}

function buildBookmarkLeaf(bm: NormalizedBookmark): LeafItem {
  return {
    WebBookmarkType: 'WebBookmarkTypeLeaf',
    WebBookmarkUUID: makeUuid(bm.id),
    URLString: bm.url,
    URIDictionary: { title: bm.title, '': bm.url },
  };
}

function buildFolderList(
  folder: NormalizedFolder,
  rootKey: RootKey,
  folders: NormalizedFolder[],
  bookmarks: NormalizedBookmark[],
): ListItem {
  return {
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkUUID: makeUuid(folder.id),
    Title: folder.name,
    Children: buildChildrenForPath(folder.pathNormalized, rootKey, folders, bookmarks),
  };
}

function buildChildrenForPath(
  parentPath: string,
  rootKey: RootKey,
  folders: NormalizedFolder[],
  bookmarks: NormalizedBookmark[],
): PlistChild[] {
  // Folders first (deterministic by name) then bookmarks (deterministic by
  // title) to keep Safari's UI ordering stable across writes.
  const subFolders = folders
    .filter((f) => f.rootKey === rootKey && f.parentPath === parentPath)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const localBookmarks = bookmarks
    .filter((b) => b.rootKey === rootKey && b.folderPath === parentPath)
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));

  const out: PlistChild[] = [];
  for (const f of subFolders) {
    out.push(buildFolderList(f, rootKey, folders, bookmarks));
  }
  for (const b of localBookmarks) {
    out.push(buildBookmarkLeaf(b));
  }
  return out;
}

function rebuildSafariRoot(
  rootTitle: string,
  rootKey: RootKey,
  existing: ListItem | undefined,
  snapshot: NormalizedSnapshot,
): ListItem {
  return {
    WebBookmarkType: 'WebBookmarkTypeList',
    WebBookmarkUUID: existing?.WebBookmarkUUID ?? makeUuid(undefined),
    Title: rootTitle,
    Children: buildChildrenForPath(ROOT_TO_PATH[rootKey], rootKey, snapshot.folders, snapshot.bookmarks),
  };
}

export type WriteOptions = {
  plistPath: string;
  browserId: string;
  snapshot: NormalizedSnapshot;
  /** Override Electron's userData dir (used for tests). */
  userDataDir?: string;
};

export function writeSafariBookmarks({
  plistPath,
  browserId,
  snapshot,
  userDataDir,
}: WriteOptions): void {
  const lock = checkSafariRunning();
  if (lock.running) {
    throw new BrowserRunningError(browserId, lock.pid);
  }

  // Parse the existing plist so we can preserve every passthrough item:
  // Reading List, Sync metadata, History proxies, unknown future Apple keys.
  const parsed: SafariRoot = parseSafariPlist(plistPath);
  const existingChildren = (parsed.Children ?? []) as PlistChild[];

  // Index existing top-level lists by title so we can keep their UUIDs stable.
  const existingByTitle = new Map<string, ListItem>();
  for (const child of existingChildren) {
    if ((child as { WebBookmarkType?: string }).WebBookmarkType === 'WebBookmarkTypeList') {
      const list = child as ListItem;
      if (typeof list.Title === 'string') existingByTitle.set(list.Title, list);
    }
  }

  // Build the new list of top-level Children:
  //   - For BookmarksBar / BookmarksMenu: rebuild from the snapshot
  //   - For Reading List: passthrough untouched
  //   - For everything else (proxies, unknown lists): passthrough untouched
  const newChildren: PlistChild[] = [];

  // Track which Safari titles we've already inserted to avoid duplicates if
  // the existing plist had an unusual ordering.
  const insertedTitles = new Set<string>();

  for (const child of existingChildren) {
    const wbt = (child as { WebBookmarkType?: string }).WebBookmarkType;
    if (wbt !== 'WebBookmarkTypeList') {
      newChildren.push(child);
      continue;
    }
    const list = child as ListItem;
    const title = list.Title ?? '';

    if (title === READING_LIST_TITLE) {
      newChildren.push(list); // never touched, exact reference back into the parsed tree
      insertedTitles.add(title);
      continue;
    }

    // Map Safari title -> internal RootKey
    const rootKey = inverseRootForSafariTitle(title);
    if (!rootKey || !isSafariSyncableRoot(rootKey)) {
      // Unknown top-level list — keep as-is (passthrough).
      newChildren.push(list);
      insertedTitles.add(title);
      continue;
    }

    newChildren.push(rebuildSafariRoot(title, rootKey, list, snapshot));
    insertedTitles.add(title);
  }

  // If the existing plist was missing one of our two roots (rare — fresh
  // Safari profile), append it so the snapshot makes it onto disk.
  for (const rootKey of SAFARI_ROOTS) {
    const safariTitle = ROOT_TO_SAFARI_TITLE[rootKey];
    if (!safariTitle) continue;
    if (insertedTitles.has(safariTitle)) continue;
    newChildren.push(rebuildSafariRoot(safariTitle, rootKey, undefined, snapshot));
  }

  // Build the final root, mutating only `Children`. Every other top-level
  // key (Title, WebBookmarkType, WebBookmarkUUID, WebBookmarkFileVersion,
  // Sync, future Apple additions) survives by reference.
  const finalRoot: SafariRoot = { ...parsed, Children: newChildren };

  // Backup before write.
  backupPlist(browserId, plistPath, userDataDir);

  // Atomic temp + rename. simple-plist writes binary plist by default with
  // writeBinaryFileSync, which is what Safari expects.
  const tmpPath = `${plistPath}.junction-${process.pid}.tmp`;
  try {
    plist.writeBinaryFileSync(tmpPath, finalRoot);
    renameSync(tmpPath, plistPath);
  } catch (err) {
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      // ignore cleanup failures
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new SafariPermissionError(plistPath, err);
    }
    throw new SafariParseError(plistPath, err);
  }
}

function inverseRootForSafariTitle(title: string): RootKey | null {
  for (const [k, v] of Object.entries(ROOT_TO_SAFARI_TITLE)) {
    if (v === title) return k as RootKey;
  }
  return null;
}
