import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeUrl } from '../../lib/url-normalize';
import { ROOT_TO_PATH } from './mapping';
import { ROOT_GUIDS } from './schema';
import { SELECT_ALL_NODES, SELECT_ROOTS_BY_GUID } from './sql';
import {
  FirefoxParseError,
  type NormalizedBookmark,
  type NormalizedFolder,
  type NormalizedSnapshot,
  type RootKey,
} from './types';

type RawNode = {
  id: number;
  parent: number;
  position: number;
  type: number; // 1 = url, 2 = folder
  title: string | null;
  guid: string;
  dateAdded: number | null;
  lastModified: number | null;
  fk: number | null;
  url: string | null;
};

type Acc = {
  folders: NormalizedFolder[];
  bookmarks: NormalizedBookmark[];
};

function snapshotToTemp(placesPath: string): { tmpFile: string; cleanup: () => void } {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-firefox-'));
  const tmpFile = path.join(tmpDir, 'places.sqlite');
  copyFileSync(placesPath, tmpFile);

  // Co-copy the WAL and SHM files when present so SQLite sees uncommitted
  // writes Firefox hasn't flushed into the main file yet. Without these we
  // would read a snapshot stale by however long Firefox's last checkpoint was.
  const walSrc = `${placesPath}-wal`;
  if (existsSync(walSrc)) copyFileSync(walSrc, `${tmpFile}-wal`);
  const shmSrc = `${placesPath}-shm`;
  if (existsSync(shmSrc)) copyFileSync(shmSrc, `${tmpFile}-shm`);

  return {
    tmpFile,
    cleanup: () => {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

function microsecondsToIso(value: number | null): string | null {
  if (value === null || value === undefined) return null;
  // Firefox stores microseconds since epoch.
  const ms = Math.floor(value / 1000);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

function isSyncableUrl(url: string | null): boolean {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

function buildHierarchy(
  rootId: number,
  rootKey: RootKey,
  childrenByParent: Map<number, RawNode[]>,
  acc: Acc,
): void {
  const rootChildren = childrenByParent.get(rootId) ?? [];
  for (const child of rootChildren) {
    walk(child, rootKey, ROOT_TO_PATH[rootKey], childrenByParent, acc);
  }
}

function walk(
  node: RawNode,
  rootKey: RootKey,
  parentPath: string,
  childrenByParent: Map<number, RawNode[]>,
  acc: Acc,
): void {
  const dateAdded = microsecondsToIso(node.dateAdded);
  const dateModified = microsecondsToIso(node.lastModified);

  if (node.type === 1) {
    if (!isSyncableUrl(node.url)) return;
    acc.bookmarks.push({
      id: node.guid,
      url: node.url!,
      urlNormalized: normalizeUrl(node.url!),
      title: node.title ?? '',
      folderPath: parentPath,
      rootKey,
      dateAdded,
      dateModified,
    });
    return;
  }

  if (node.type === 2) {
    const name = node.title ?? '';
    const folderPath = `${parentPath}/${slugify(name)}`;
    acc.folders.push({
      id: node.guid,
      name,
      pathNormalized: folderPath,
      parentPath,
      rootKey,
      dateAdded,
      dateModified,
    });
    const children = childrenByParent.get(node.id) ?? [];
    for (const child of children) {
      walk(child, rootKey, folderPath, childrenByParent, acc);
    }
  }
}

export function readBookmarks(placesPath: string, browserId: string): NormalizedSnapshot {
  const { tmpFile, cleanup } = snapshotToTemp(placesPath);
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(tmpFile, { readOnly: true });

    const rootRows = db.prepare(SELECT_ROOTS_BY_GUID).all() as Array<{ id: number; guid: string }>;
    const rootIdByGuid = new Map(rootRows.map((r) => [r.guid, r.id]));

    const allNodes = db.prepare(SELECT_ALL_NODES).all() as unknown as RawNode[];
    const childrenByParent = new Map<number, RawNode[]>();
    for (const n of allNodes) {
      const list = childrenByParent.get(n.parent);
      if (list) list.push(n);
      else childrenByParent.set(n.parent, [n]);
    }

    const acc: Acc = { folders: [], bookmarks: [] };

    for (const [rootKey, guid] of Object.entries(ROOT_GUIDS) as Array<[RootKey, string]>) {
      const rootId = rootIdByGuid.get(guid);
      if (rootId === undefined) continue; // root missing from this profile — skip
      // Synthesize the root folder entry so consumers know the root exists.
      acc.folders.push({
        id: guid,
        name: rootKey,
        pathNormalized: ROOT_TO_PATH[rootKey],
        parentPath: null,
        rootKey,
        dateAdded: null,
        dateModified: null,
      });
      buildHierarchy(rootId, rootKey, childrenByParent, acc);
    }

    return {
      browserId,
      folders: acc.folders,
      bookmarks: acc.bookmarks,
    };
  } catch (err) {
    if (err instanceof FirefoxParseError) throw err;
    throw new FirefoxParseError(browserId, err);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
    cleanup();
  }
}
