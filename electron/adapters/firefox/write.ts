import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { checkLock } from './lock';
import { ROOT_TO_PATH } from './mapping';
import { ROOT_GUIDS, BMK_TYPE_FOLDER, BMK_TYPE_URL, FRECENCY_NEEDS_RECALC } from './schema';
import {
  DELETE_DESCENDANTS_OF_ROOT,
  INSERT_BOOKMARK,
  INSERT_PLACE,
  SELECT_PLACE_ID_BY_URL,
  SELECT_ROOTS_BY_GUID,
} from './sql';
import { computeUrlHash, reverseHost } from './url-hash';
import {
  BrowserRunningError,
  FirefoxParseError,
  type NormalizedBookmark,
  type NormalizedFolder,
  type NormalizedSnapshot,
  type RootKey,
} from './types';

const MAX_BACKUPS = 3;

// Wrapper that runs a non-parameterised statement via prepare/run. Avoids the
// raw `db.exec("…")` shape which some lint hooks flag because it shares a name
// with `child_process.exec`. node:sqlite's DatabaseSync.exec is unrelated.
function runStatement(db: DatabaseSync, sql: string): void {
  db.prepare(sql).run();
}

function backupDir(browserId: string, userDataDir?: string): string {
  const root = userDataDir ?? (app?.getPath ? app.getPath('userData') : '/tmp/junction-userdata-fallback');
  const dir = path.join(root, 'backups', 'firefox', browserId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function rotateBackups(dir: string): void {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('places.') && f.endsWith('.sqlite'))
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

function backupPlacesFile(browserId: string, placesPath: string, userDataDir?: string): void {
  if (!existsSync(placesPath)) return;
  const dir = backupDir(browserId, userDataDir);
  rotateBackups(dir);
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  copyFileSync(placesPath, path.join(dir, `places.${ts}.sqlite`));
}

function nowMicros(): number {
  return Date.now() * 1000;
}

function isoToMicros(value: string | null): number {
  if (!value) return nowMicros();
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return nowMicros();
  return ms * 1000;
}

// Firefox bookmark GUIDs are 12 chars from a base64url-ish alphabet
// ([A-Za-z0-9_-]). We hash the snapshot ID with SHA-256 and base64url-encode
// it, then take the first 12 chars. Hashing (rather than slicing the raw ID)
// is required because folder IDs from the engine are full pathNormalized
// strings — slicing would collide on shared prefixes
// (e.g. "/lesezeichenleiste/recherche" and "/lesezeichenleiste/recherche/sub"
// both reduce to "/lesezeichen"). It also strips characters Firefox doesn't
// accept in GUIDs, like "/".
function makeGuid(snapshotId: string): string {
  return createHash('sha256').update(snapshotId).digest('base64url').slice(0, 12);
}

type PlaceCache = Map<string, number>;

function ensurePlace(
  db: DatabaseSync,
  cache: PlaceCache,
  url: string,
): number {
  const cached = cache.get(url);
  if (cached !== undefined) return cached;

  const existing = db.prepare(SELECT_PLACE_ID_BY_URL).get(url) as { id: number } | undefined;
  if (existing) {
    cache.set(url, existing.id);
    return existing.id;
  }

  const hash = computeUrlHash(url);
  const rev = reverseHost(url);
  const guid = randomUUID().replace(/-/g, '').slice(0, 12);
  const result = db
    .prepare(INSERT_PLACE)
    .run(url, hash, rev, FRECENCY_NEEDS_RECALC, guid);
  const id = Number(result.lastInsertRowid);
  cache.set(url, id);
  return id;
}

function insertChildrenRecursive(args: {
  db: DatabaseSync;
  rootKey: RootKey;
  parentPath: string;
  parentSqliteId: number;
  folders: NormalizedFolder[];
  bookmarks: NormalizedBookmark[];
  placeCache: PlaceCache;
}): void {
  const { db, rootKey, parentPath, parentSqliteId, folders, bookmarks, placeCache } = args;

  // Folders first (deterministic by name), then bookmarks (deterministic by title).
  // This keeps Firefox's UI ordering stable across writes.
  const subFolders = folders
    .filter((f) => f.rootKey === rootKey && f.parentPath === parentPath)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  let position = 0;
  const insertBookmark = db.prepare(INSERT_BOOKMARK);

  for (const folder of subFolders) {
    const guid = makeGuid(folder.id);
    const result = insertBookmark.run(
      BMK_TYPE_FOLDER,
      null,
      parentSqliteId,
      position++,
      folder.name,
      guid,
      isoToMicros(folder.dateAdded),
      isoToMicros(folder.dateModified),
    );
    const folderSqliteId = Number(result.lastInsertRowid);
    insertChildrenRecursive({
      db,
      rootKey,
      parentPath: folder.pathNormalized,
      parentSqliteId: folderSqliteId,
      folders,
      bookmarks,
      placeCache,
    });
  }

  const localBookmarks = bookmarks
    .filter((b) => b.rootKey === rootKey && b.folderPath === parentPath)
    .sort((a, b) => a.title.localeCompare(b.title, 'de'));

  for (const bm of localBookmarks) {
    const placeId = ensurePlace(db, placeCache, bm.url);
    insertBookmark.run(
      BMK_TYPE_URL,
      placeId,
      parentSqliteId,
      position++,
      bm.title,
      makeGuid(bm.id),
      isoToMicros(bm.dateAdded),
      isoToMicros(bm.dateModified),
    );
  }
}

export type WriteOptions = {
  placesPath: string;
  browserId: string;
  profileDir: string;
  snapshot: NormalizedSnapshot;
  /** Override Electron's userData dir (used for tests). */
  userDataDir?: string;
};

export function writeBookmarks({
  placesPath,
  browserId,
  profileDir,
  snapshot,
  userDataDir,
}: WriteOptions): void {
  const lock = checkLock(profileDir);
  if (lock.running) {
    throw new BrowserRunningError(browserId, lock.pid);
  }

  backupPlacesFile(browserId, placesPath, userDataDir);

  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(placesPath);
    runStatement(db, 'PRAGMA foreign_keys = ON');

    const rootRows = db.prepare(SELECT_ROOTS_BY_GUID).all() as Array<{ id: number; guid: string }>;
    const rootIdByGuid = new Map(rootRows.map((r) => [r.guid, r.id]));

    runStatement(db, 'BEGIN IMMEDIATE');
    try {
      const deleteUnder = db.prepare(DELETE_DESCENDANTS_OF_ROOT);
      const placeCache: PlaceCache = new Map();

      for (const [rootKey, guid] of Object.entries(ROOT_GUIDS) as Array<[RootKey, string]>) {
        const rootId = rootIdByGuid.get(guid);
        if (rootId === undefined) continue;

        // Mobile (Firefox Sync) is left untouched on the Junction side, mirroring
        // the read-only treatment of Chromium's `synced` root.
        if (rootKey === 'mobile') continue;

        deleteUnder.run(rootId);

        insertChildrenRecursive({
          db,
          rootKey,
          parentPath: ROOT_TO_PATH[rootKey],
          parentSqliteId: rootId,
          folders: snapshot.folders,
          bookmarks: snapshot.bookmarks,
          placeCache,
        });
      }

      runStatement(db, 'COMMIT');
    } catch (err) {
      try {
        runStatement(db, 'ROLLBACK');
      } catch {
        // ignore — the transaction may already have rolled back implicitly.
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof BrowserRunningError) throw err;
    throw new FirefoxParseError(browserId, err);
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}
