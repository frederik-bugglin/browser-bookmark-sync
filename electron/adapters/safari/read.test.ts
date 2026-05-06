// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSafariFixture } from './__fixtures__/build-fixture';
import { readSafariBookmarks } from './read';
import { SafariParseError } from './types';

describe('readSafariBookmarks', () => {
  let tmpDir: string;
  let plistPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-safari-read-'));
    plistPath = path.join(tmpDir, 'Bookmarks.plist');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads BookmarksBar and BookmarksMenu into the right roots', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [
        { kind: 'leaf', uuid: 'BAR-LEAF-1', title: 'Anthropic', url: 'https://anthropic.com/' },
        {
          kind: 'folder',
          uuid: 'BAR-FOLDER-1',
          title: 'Recherche',
          children: [
            { kind: 'leaf', uuid: 'BAR-LEAF-2', title: 'Wikipedia', url: 'https://wikipedia.org/' },
          ],
        },
      ],
      bookmarksMenu: [
        { kind: 'leaf', uuid: 'MENU-LEAF-1', title: 'NZZ', url: 'https://nzz.ch/' },
      ],
    });

    const snapshot = readSafariBookmarks(plistPath, 'safari');

    const titles = snapshot.bookmarks.map((b) => b.title).sort();
    expect(titles).toEqual(['Anthropic', 'NZZ', 'Wikipedia']);

    const bar = snapshot.bookmarks.filter((b) => b.rootKey === 'toolbar');
    expect(bar.map((b) => b.title).sort()).toEqual(['Anthropic', 'Wikipedia']);
    const menu = snapshot.bookmarks.filter((b) => b.rootKey === 'unfiled');
    expect(menu.map((b) => b.title)).toEqual(['NZZ']);

    // Root folder synthesised, plus the nested "Recherche" folder.
    const folderNames = snapshot.folders.map((f) => f.name).sort();
    expect(folderNames).toContain('Recherche');
    expect(folderNames).toContain('BookmarksBar');
    expect(folderNames).toContain('BookmarksMenu');

    const recherche = snapshot.folders.find((f) => f.name === 'Recherche');
    expect(recherche?.parentPath).toBe('/lesezeichenleiste');
    expect(recherche?.pathNormalized).toBe('/lesezeichenleiste/recherche');
    const wiki = snapshot.bookmarks.find((b) => b.title === 'Wikipedia');
    expect(wiki?.folderPath).toBe('/lesezeichenleiste/recherche');
  });

  it('skips the Reading List entirely', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [
        { kind: 'leaf', title: 'Apple', url: 'https://apple.com/' },
      ],
      bookmarksMenu: [],
      readingList: [
        {
          WebBookmarkType: 'WebBookmarkTypeLeaf',
          WebBookmarkUUID: 'RL-1',
          URLString: 'https://nytimes.com/article-1',
          URIDictionary: { title: 'Reading list article', '': 'https://nytimes.com/article-1' },
          ReadingList: { DateAdded: new Date('2026-04-01T10:00:00Z') },
          ReadingListNonSync: { DateLastFetched: new Date('2026-04-02T11:00:00Z') },
        },
      ],
    });

    const snapshot = readSafariBookmarks(plistPath);

    expect(snapshot.bookmarks).toHaveLength(1);
    expect(snapshot.bookmarks[0].url).toBe('https://apple.com/');
    expect(snapshot.bookmarks.find((b) => b.url.includes('nytimes'))).toBeUndefined();
  });

  it('strips tracking parameters from URLs (urlNormalized)', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [
        {
          kind: 'leaf',
          title: 'Tracked',
          url: 'https://example.com/path?utm_source=twitter&id=42',
        },
      ],
      bookmarksMenu: [],
    });
    const snapshot = readSafariBookmarks(plistPath);
    expect(snapshot.bookmarks[0].url).toBe('https://example.com/path?utm_source=twitter&id=42');
    expect(snapshot.bookmarks[0].urlNormalized).toBe('https://example.com/path?id=42');
  });

  it('throws SafariParseError when the file is missing', () => {
    expect(() => readSafariBookmarks(path.join(tmpDir, 'missing.plist'))).toThrow(SafariParseError);
  });

  it('throws SafariParseError when the file is garbage', () => {
    writeFileSync(plistPath, 'not a real plist');
    expect(() => readSafariBookmarks(plistPath)).toThrow(SafariParseError);
  });

  it('ignores non-syncable URL schemes (file://, javascript:)', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [
        { kind: 'leaf', title: 'OK', url: 'https://ok.example/' },
        { kind: 'leaf', title: 'Local', url: 'file:///Users/fb/index.html' },
      ],
      bookmarksMenu: [],
    });
    const snapshot = readSafariBookmarks(plistPath);
    expect(snapshot.bookmarks).toHaveLength(1);
    expect(snapshot.bookmarks[0].title).toBe('OK');
  });
});
