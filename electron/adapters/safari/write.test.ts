// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import plist from 'simple-plist';
import { buildSafariFixture } from './__fixtures__/build-fixture';
import { readSafariBookmarks } from './read';
import { writeSafariBookmarks } from './write';
import type { NormalizedSnapshot } from './types';

describe('writeSafariBookmarks', () => {
  let tmpDir: string;
  let plistPath: string;
  let userDataDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-safari-write-'));
    plistPath = path.join(tmpDir, 'Bookmarks.plist');
    userDataDir = mkdtempSync(path.join(os.tmpdir(), 'junction-userdata-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
  });

  it('round-trips a simple snapshot through Read -> Write -> Read', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [
        { kind: 'leaf', title: 'Anthropic', url: 'https://anthropic.com/' },
      ],
      bookmarksMenu: [],
    });
    const initial = readSafariBookmarks(plistPath);

    const snapshot: NormalizedSnapshot = {
      browserId: 'safari',
      folders: initial.folders,
      bookmarks: [
        ...initial.bookmarks,
        {
          id: 'NEW-BM-UUID-0000000000000000000001',
          url: 'https://wikipedia.org/',
          urlNormalized: 'https://wikipedia.org/',
          title: 'Wikipedia',
          folderPath: '/lesezeichenleiste',
          rootKey: 'toolbar',
          dateAdded: null,
          dateModified: null,
        },
      ],
    };

    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    const after = readSafariBookmarks(plistPath);
    const titles = after.bookmarks.map((b) => b.title).sort();
    expect(titles).toEqual(['Anthropic', 'Wikipedia']);
  });

  it('preserves the Reading List exactly across a write', () => {
    const readingListItem = {
      WebBookmarkType: 'WebBookmarkTypeLeaf',
      WebBookmarkUUID: 'RL-LEAF-UUID-0000-0001',
      URLString: 'https://nytimes.com/article-1',
      URIDictionary: { title: 'Read me later', '': 'https://nytimes.com/article-1' },
      ReadingList: { DateAdded: new Date('2026-04-01T10:00:00Z') },
    };
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
      readingList: [readingListItem],
    });

    const snapshot = readSafariBookmarks(plistPath);

    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    // Re-parse the raw plist (not via the adapter, which filters Reading List).
    const raw = plist.readFileSync<{ Children: Array<Record<string, unknown>> }>(plistPath);
    const rl = raw.Children.find((c) => c['Title'] === 'com.apple.ReadingList') as {
      Children: Array<Record<string, unknown>>;
    } | undefined;
    expect(rl).toBeDefined();
    expect(rl!.Children).toHaveLength(1);
    const rlLeaf = rl!.Children[0];
    expect(rlLeaf['URLString']).toBe('https://nytimes.com/article-1');
    expect(rlLeaf['WebBookmarkUUID']).toBe('RL-LEAF-UUID-0000-0001');
    // The ReadingList sub-dict must survive the write.
    expect(rlLeaf['ReadingList']).toBeDefined();
  });

  it('preserves unknown top-level lists (passthrough)', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
      extraLists: [
        {
          Title: 'com.apple.SomeFutureList',
          Children: [],
          MysteryAppleField: 'mystery-value',
        },
      ],
    });

    const snapshot = readSafariBookmarks(plistPath);
    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    const raw = plist.readFileSync<{ Children: Array<Record<string, unknown>> }>(plistPath);
    const future = raw.Children.find((c) => c['Title'] === 'com.apple.SomeFutureList');
    expect(future).toBeDefined();
    expect((future as Record<string, unknown>)['MysteryAppleField']).toBe('mystery-value');
  });

  it('preserves the History proxy entry', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
    });

    const snapshot = readSafariBookmarks(plistPath);
    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    const raw = plist.readFileSync<{ Children: Array<Record<string, unknown>> }>(plistPath);
    const proxy = raw.Children.find((c) => c['WebBookmarkType'] === 'WebBookmarkTypeProxy');
    expect(proxy).toBeDefined();
    expect((proxy as Record<string, unknown>)['Title']).toBe('History');
  });

  it('writes the file as binary plist (Safari-compatible)', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
    });
    const snapshot = readSafariBookmarks(plistPath);
    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    // Binary plists start with the magic bytes "bplist00".
    const buf = readFileSync(plistPath);
    expect(buf.slice(0, 8).toString('utf8')).toBe('bplist00');
  });

  it('creates a backup before writing', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
    });
    const snapshot = readSafariBookmarks(plistPath);
    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    const backupRoot = path.join(userDataDir, 'backups', 'safari', 'safari');
    expect(existsSync(backupRoot)).toBe(true);
    const files = readdirSync(backupRoot).filter((f) => f.startsWith('Bookmarks.') && f.endsWith('.plist'));
    expect(files.length).toBe(1);
  });

  it('rotates backups after MAX_BACKUPS writes', () => {
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
    });
    const snapshot = readSafariBookmarks(plistPath);

    for (let i = 0; i < 5; i++) {
      writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });
      // Delay to ensure timestamp uniqueness across iterations.
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait a few ms
      }
    }
    const backupRoot = path.join(userDataDir, 'backups', 'safari', 'safari');
    const files = readdirSync(backupRoot).filter((f) => f.startsWith('Bookmarks.') && f.endsWith('.plist'));
    expect(files.length).toBeLessThanOrEqual(3);
  });

  it('appends missing roots when the existing plist lacks them', () => {
    // Build a fixture without BookmarksMenu by overwriting after build.
    buildSafariFixture(plistPath, {
      bookmarksBar: [{ kind: 'leaf', title: 'Apple', url: 'https://apple.com/' }],
      bookmarksMenu: [],
    });
    // Manually strip BookmarksMenu from the parsed plist.
    const raw = plist.readFileSync<{ Children: Array<Record<string, unknown>> }>(plistPath);
    raw.Children = raw.Children.filter((c) => c['Title'] !== 'BookmarksMenu');
    plist.writeBinaryFileSync(plistPath, raw);

    const snapshot: NormalizedSnapshot = {
      browserId: 'safari',
      folders: [],
      bookmarks: [
        {
          id: 'NEW-1',
          url: 'https://nzz.ch/',
          urlNormalized: 'https://nzz.ch/',
          title: 'NZZ',
          folderPath: '/andere-lesezeichen',
          rootKey: 'unfiled',
          dateAdded: null,
          dateModified: null,
        },
      ],
    };

    writeSafariBookmarks({ plistPath, browserId: 'safari', snapshot, userDataDir });

    const after = readSafariBookmarks(plistPath);
    expect(after.bookmarks.find((b) => b.title === 'NZZ')).toBeDefined();
  });
});
