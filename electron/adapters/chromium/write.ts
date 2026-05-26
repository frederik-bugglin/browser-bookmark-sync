import { copyFileSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { computeChecksum } from './checksum';
import { checkLock } from './lock';
import {
  BrowserRunningError,
  ChromiumBookmarksFileSchema,
  ChromiumParseError,
  type ChromiumFolderNode,
  type ChromiumNode,
  type NormalizedBookmark,
  type NormalizedFolder,
  type NormalizedSnapshot,
  type RootKey,
} from './types';

const MAX_BACKUPS = 3;

// Inverse of chromiumTimeToIso in read.ts. Chromium stores date_added /
// date_modified as a decimal string of microseconds since 1601-01-01 UTC.
// Writing an ISO string here would silently strip the timestamp on the
// next Chromium load — so we always convert at the adapter boundary.
const CHROMIUM_EPOCH_OFFSET_MICROS = 11644473600000000n;

function isoToChromiumTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const unixMicros = BigInt(ms) * 1000n;
  const chromiumMicros = unixMicros + CHROMIUM_EPOCH_OFFSET_MICROS;
  return chromiumMicros.toString();
}

function backupDir(browserId: string, userDataDir?: string): string {
  const root = userDataDir ?? (app?.getPath ? app.getPath('userData') : '/tmp/junction-userdata-fallback');
  const dir = path.join(root, 'backups', 'chromium', browserId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function rotateBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('Bookmarks.') && f.endsWith('.json'))
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

function backupBookmarksFile(browserId: string, bookmarksPath: string, userDataDir?: string): void {
  if (!existsSync(bookmarksPath)) return;
  const dir = backupDir(browserId, userDataDir);
  rotateBackups(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(bookmarksPath, path.join(dir, `Bookmarks.${ts}.json`));
}

function buildChildren(
  rootKey: RootKey,
  parentPath: string,
  folders: NormalizedFolder[],
  bookmarks: NormalizedBookmark[],
): ChromiumNode[] {
  const children: ChromiumNode[] = [];

  const subFolders = folders
    .filter((f) => f.rootKey === rootKey && f.parentPath === parentPath)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  for (const f of subFolders) {
    const folderNode: ChromiumFolderNode = {
      id: f.id,
      name: f.name,
      type: 'folder',
      children: buildChildren(rootKey, f.pathNormalized, folders, bookmarks),
    };
    const folderAdded = isoToChromiumTime(f.dateAdded);
    if (folderAdded) folderNode.date_added = folderAdded;
    const folderModified = isoToChromiumTime(f.dateModified);
    if (folderModified) folderNode.date_modified = folderModified;
    children.push(folderNode);
  }

  const localBookmarks = bookmarks
    .filter((b) => b.rootKey === rootKey && b.folderPath === parentPath)
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));

  for (const b of localBookmarks) {
    const added = isoToChromiumTime(b.dateAdded);
    const modified = isoToChromiumTime(b.dateModified);
    children.push({
      id: b.id,
      name: b.title,
      type: 'url',
      url: b.url,
      ...(added ? { date_added: added } : {}),
      ...(modified ? { date_modified: modified } : {}),
    });
  }

  return children;
}

function rebuildRoot(
  rootKey: RootKey,
  originalRoot: ChromiumFolderNode,
  snapshot: NormalizedSnapshot,
): ChromiumFolderNode {
  const rootEntry = snapshot.folders.find(
    (f) => f.rootKey === rootKey && f.parentPath === null,
  );
  const rootPath = rootEntry?.pathNormalized ?? '';
  return {
    ...originalRoot,
    children: buildChildren(rootKey, rootPath, snapshot.folders, snapshot.bookmarks),
  };
}

export type WriteOptions = {
  bookmarksPath: string;
  browserId: string;
  profileDir: string;
  snapshot: NormalizedSnapshot;
  /** Override Electron's userData dir (used for tests). */
  userDataDir?: string;
};

export function writeBookmarks({ bookmarksPath, browserId, profileDir, snapshot, userDataDir }: WriteOptions): void {
  // SingletonLock sits in the user-data root (parent of "Default"), not in
  // the profile dir. See detect.ts for the same rationale.
  const lock = checkLock(path.dirname(profileDir));
  if (lock.running) {
    throw new BrowserRunningError(browserId, lock.pid);
  }

  let originalParsed;
  try {
    const raw = readFileSync(bookmarksPath, 'utf8');
    originalParsed = ChromiumBookmarksFileSchema.parse(JSON.parse(raw));
  } catch (err) {
    throw new ChromiumParseError(browserId, err);
  }

  backupBookmarksFile(browserId, bookmarksPath, userDataDir);

  const newRoots = {
    bookmark_bar: rebuildRoot('bookmark_bar', originalParsed.roots.bookmark_bar, snapshot),
    other: rebuildRoot('other', originalParsed.roots.other, snapshot),
    synced: originalParsed.roots.synced,
  };

  const checksum = computeChecksum(newRoots);

  const outFile = {
    ...originalParsed,
    roots: newRoots,
    checksum,
    version: originalParsed.version ?? 1,
  };

  const tmpPath = `${bookmarksPath}.junction-tmp`;
  writeFileSync(tmpPath, JSON.stringify(outFile, null, 3), 'utf8');
  renameSync(tmpPath, bookmarksPath);
}
