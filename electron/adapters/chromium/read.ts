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
      dateAdded: node.date_added ?? null,
      dateModified: node.date_modified ?? null,
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
    dateAdded: node.date_added ?? null,
    dateModified: node.date_modified ?? null,
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
