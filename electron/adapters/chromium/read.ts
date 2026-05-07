import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeUrl } from '../../lib/url-normalize';
import { ROOT_TO_PATH } from './mapping';
import {
  ChromiumBookmarksFileSchema,
  ChromiumParseError,
  type ChromiumNode,
  type NormalizedBookmark,
  type NormalizedFolder,
  type NormalizedSnapshot,
  type RootKey,
} from './types';

function snapshotToTemp(srcPath: string): { tmpFile: string; cleanup: () => void } {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-chromium-'));
  const tmpFile = path.join(tmpDir, 'Bookmarks.json');
  copyFileSync(srcPath, tmpFile);
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

type Acc = {
  folders: NormalizedFolder[];
  bookmarks: NormalizedBookmark[];
};

// Chromium stores `date_added` and `date_modified` as a decimal string of
// microseconds since 1601-01-01 UTC (Windows FILETIME / WebKit time). The
// engine and the Supabase schema speak ISO-8601, so we convert at the
// adapter boundary. BigInt because the value overflows Number precision.
const CHROMIUM_EPOCH_OFFSET_MICROS = 11644473600000000n;

function chromiumTimeToIso(value: string | undefined | null): string | null {
  if (!value || value === '0') return null;
  let micros: bigint;
  try {
    micros = BigInt(value);
  } catch {
    return null;
  }
  if (micros <= 0n) return null;
  const unixMicros = micros - CHROMIUM_EPOCH_OFFSET_MICROS;
  if (unixMicros < 0n) return null;
  const unixMillis = Number(unixMicros / 1000n);
  if (!Number.isFinite(unixMillis) || unixMillis < 0) return null;
  try {
    return new Date(unixMillis).toISOString();
  } catch {
    return null;
  }
}

function walk(
  node: ChromiumNode,
  rootKey: RootKey,
  parentPath: string,
  acc: Acc,
): void {
  if (node.type === 'url') {
    acc.bookmarks.push({
      id: node.id,
      url: node.url,
      urlNormalized: normalizeUrl(node.url),
      title: node.name,
      folderPath: parentPath,
      rootKey,
      dateAdded: chromiumTimeToIso(node.date_added),
      dateModified: chromiumTimeToIso(node.date_modified),
    });
    return;
  }

  // folder
  const slug = node.name.trim().toLowerCase().replace(/\s+/g, '-');
  const isRoot = parentPath === '';
  const folderPath = isRoot ? ROOT_TO_PATH[rootKey] : `${parentPath}/${slug}`;

  acc.folders.push({
    id: node.id,
    name: node.name,
    pathNormalized: folderPath,
    parentPath: isRoot ? null : parentPath,
    rootKey,
    dateAdded: chromiumTimeToIso(node.date_added),
    dateModified: chromiumTimeToIso(node.date_modified),
  });

  for (const child of node.children) {
    walk(child, rootKey, folderPath, acc);
  }
}

export function readBookmarks(bookmarksPath: string, browserId: string): NormalizedSnapshot {
  const { tmpFile, cleanup } = snapshotToTemp(bookmarksPath);
  try {
    const raw = readFileSync(tmpFile, 'utf8');
    const parsedJson = JSON.parse(raw);
    const file = ChromiumBookmarksFileSchema.parse(parsedJson);
    const acc: Acc = { folders: [], bookmarks: [] };
    walk(file.roots.bookmark_bar, 'bookmark_bar', '', acc);
    walk(file.roots.other, 'other', '', acc);
    walk(file.roots.synced, 'synced', '', acc);
    return {
      browserId,
      folders: acc.folders,
      bookmarks: acc.bookmarks,
    };
  } catch (err) {
    if (err instanceof ChromiumParseError) throw err;
    throw new ChromiumParseError(browserId, err);
  } finally {
    cleanup();
  }
}
