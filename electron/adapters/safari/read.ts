import { existsSync } from 'node:fs';
import plist from 'simple-plist';
import bplistParser from 'bplist-parser';

// bplist-parser defaults to 32k objects per file; Safari power-user
// libraries routinely exceed that (one observed case: 1.7 MB plist
// with > 32k nested dicts). Bumping this single export propagates to
// simple-plist because both modules share the require-cache instance.
(bplistParser as unknown as { maxObjectCount: number }).maxObjectCount = 1_000_000;
import { normalizeUrl } from '../../lib/url-normalize';
import { READING_LIST_TITLE, ROOT_TO_PATH, SAFARI_TITLE_TO_ROOT } from './mapping';
import {
  SafariParseError,
  SafariPermissionError,
  type NormalizedBookmark,
  type NormalizedFolder,
  type NormalizedSnapshot,
  type RootKey,
} from './types';

// Safari's binary plist shape. Only the fields we read are typed; everything
// else is preserved by the writer via raw passthrough on the parsed object.
type LeafItem = {
  WebBookmarkType: 'WebBookmarkTypeLeaf';
  WebBookmarkUUID?: string;
  URLString?: string;
  URIDictionary?: { title?: string; [key: string]: unknown };
  [key: string]: unknown;
};

type ListItem = {
  WebBookmarkType: 'WebBookmarkTypeList';
  WebBookmarkUUID?: string;
  Title?: string;
  Children?: PlistChild[];
  [key: string]: unknown;
};

type ProxyItem = {
  WebBookmarkType: 'WebBookmarkTypeProxy';
  [key: string]: unknown;
};

type PlistChild = LeafItem | ListItem | ProxyItem;

export type SafariRoot = {
  // We deliberately keep Children loose (`unknown[]`) so the write path can
  // mix freshly-built nodes with passthrough nodes from the parsed plist
  // without TypeScript getting confused by structurally-identical PlistChild
  // type aliases declared in different modules.
  Children?: unknown[];
  [key: string]: unknown;
};

type Acc = {
  folders: NormalizedFolder[];
  bookmarks: NormalizedBookmark[];
};

function isList(item: PlistChild): item is ListItem {
  return item.WebBookmarkType === 'WebBookmarkTypeList';
}

function isLeaf(item: PlistChild): item is LeafItem {
  return item.WebBookmarkType === 'WebBookmarkTypeLeaf';
}

function isReadingList(item: ListItem): boolean {
  return item.Title === READING_LIST_TITLE;
}

function isSyncableUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

export function parseSafariPlist(plistPath: string): SafariRoot {
  if (!existsSync(plistPath)) {
    throw new SafariParseError(plistPath, new Error('plist does not exist'));
  }
  try {
    return plist.readFileSync<SafariRoot>(plistPath);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new SafariPermissionError(plistPath, err);
    }
    throw new SafariParseError(plistPath, err);
  }
}

function walkFolder(
  list: ListItem,
  rootKey: RootKey,
  parentPath: string,
  acc: Acc,
): void {
  const children = list.Children ?? [];
  for (const child of children) {
    if (isLeaf(child)) {
      const url = child.URLString;
      if (!isSyncableUrl(url)) continue;
      const title =
        (child.URIDictionary?.title as string | undefined) ??
        (typeof child.URIDictionary?.[''] === 'string' ? (child.URIDictionary![''] as string) : '') ??
        '';
      acc.bookmarks.push({
        id: child.WebBookmarkUUID ?? `safari-${acc.bookmarks.length}`,
        url,
        urlNormalized: normalizeUrl(url),
        title,
        folderPath: parentPath,
        rootKey,
        // Safari's plist does not store per-bookmark add/modify timestamps in
        // a stable field. The sync engine merges by URL when timestamps are
        // missing, so leaving these null is correct.
        dateAdded: null,
        dateModified: null,
      });
      continue;
    }

    if (isList(child)) {
      const name = child.Title ?? '';
      const folderPath = `${parentPath}/${slugify(name)}`;
      acc.folders.push({
        id: child.WebBookmarkUUID ?? `safari-folder-${acc.folders.length}`,
        name,
        pathNormalized: folderPath,
        parentPath,
        rootKey,
        dateAdded: null,
        dateModified: null,
      });
      walkFolder(child, rootKey, folderPath, acc);
    }
    // Proxy items (History etc.) at this level are ignored.
  }
}

export function readSafariBookmarks(plistPath: string, browserId = 'safari'): NormalizedSnapshot {
  const parsed = parseSafariPlist(plistPath);
  const topChildren = (parsed.Children ?? []) as PlistChild[];

  const acc: Acc = { folders: [], bookmarks: [] };

  for (const child of topChildren) {
    if (!isList(child)) continue;
    if (isReadingList(child)) continue; // explicit per spec — never read
    const title = child.Title ?? '';
    const rootKey = SAFARI_TITLE_TO_ROOT[title];
    if (!rootKey) continue; // unknown top-level list — leave passthrough on write
    acc.folders.push({
      id: child.WebBookmarkUUID ?? `safari-root-${title}`,
      name: title,
      pathNormalized: ROOT_TO_PATH[rootKey],
      parentPath: null,
      rootKey,
      dateAdded: null,
      dateModified: null,
    });
    walkFolder(child, rootKey, ROOT_TO_PATH[rootKey], acc);
  }

  return {
    browserId,
    folders: acc.folders,
    bookmarks: acc.bookmarks,
  };
}
