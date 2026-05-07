// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSync, constants, mkdtempSync, openSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFixtureDb } from './__fixtures__/build-fixture';
import { readBookmarks } from './read';
import { writeBookmarks } from './write';
import { BrowserRunningError, type NormalizedSnapshot } from './types';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/junction-userdata-test',
  },
}));

describe('writeBookmarks', () => {
  let tmpDir: string;
  let userDataDir: string;
  let profileDir: string;
  let placesPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-firefox-write-'));
    userDataDir = path.join(tmpDir, 'userdata');
    profileDir = path.join(tmpDir, 'profile');
    placesPath = path.join(profileDir, 'places.sqlite');
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(userDataDir, { recursive: true, force: true });
    require('node:fs').mkdirSync(profileDir, { recursive: true });
    buildFixtureDb(placesPath, []);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function snapshot(): NormalizedSnapshot {
    return {
      browserId: 'firefox',
      folders: [
        {
          id: 'folder1_____',
          name: 'Recherche',
          pathNormalized: '/lesezeichenleiste/recherche',
          parentPath: '/lesezeichenleiste',
          rootKey: 'toolbar',
          dateAdded: '2026-01-01T00:00:00.000Z',
          dateModified: '2026-01-02T00:00:00.000Z',
        },
      ],
      bookmarks: [
        {
          id: 'bm1_________',
          url: 'https://example.com/a',
          urlNormalized: 'https://example.com/a',
          title: 'A',
          folderPath: '/lesezeichenleiste/recherche',
          rootKey: 'toolbar',
          dateAdded: '2026-01-01T00:00:00.000Z',
          dateModified: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'bm2_________',
          url: 'https://example.com/b',
          urlNormalized: 'https://example.com/b',
          title: 'B',
          folderPath: '/andere-lesezeichen',
          rootKey: 'unfiled',
          dateAdded: '2026-01-01T00:00:00.000Z',
          dateModified: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'bm3_________',
          url: 'https://example.com/c',
          urlNormalized: 'https://example.com/c',
          title: 'C',
          folderPath: '/lesezeichen-menu',
          rootKey: 'menu',
          dateAdded: '2026-01-01T00:00:00.000Z',
          dateModified: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
  }

  it('writes a snapshot and read returns the same data', () => {
    writeBookmarks({
      placesPath,
      browserId: 'firefox',
      profileDir,
      snapshot: snapshot(),
      userDataDir,
    });

    const read = readBookmarks(placesPath, 'firefox');
    const titles = read.bookmarks.map((b) => b.title).sort();
    expect(titles).toEqual(['A', 'B', 'C']);

    const recherche = read.folders.find((f) => f.name === 'Recherche');
    expect(recherche?.parentPath).toBe('/lesezeichenleiste');

    const a = read.bookmarks.find((b) => b.title === 'A');
    expect(a?.folderPath).toBe('/lesezeichenleiste/recherche');
    expect(a?.rootKey).toBe('toolbar');

    const c = read.bookmarks.find((b) => b.title === 'C');
    expect(c?.rootKey).toBe('menu');
    expect(c?.folderPath).toBe('/lesezeichen-menu');
  });

  it('throws BrowserRunningError when the profile lock is held', () => {
    const O_EXLOCK = 0x20;
    if (process.platform !== 'darwin') return;
    const parentLock = path.join(profileDir, '.parentlock');
    writeFileSync(parentLock, '');
    // Hold the lock from the test process — writeBookmarks must refuse to
    // proceed.
    const fd = openSync(parentLock, constants.O_RDWR | O_EXLOCK);
    try {
      expect(() =>
        writeBookmarks({
          placesPath,
          browserId: 'firefox',
          profileDir,
          snapshot: snapshot(),
          userDataDir,
        }),
      ).toThrow(BrowserRunningError);
    } finally {
      closeSync(fd);
    }
  });

  it('creates a backup before writing', () => {
    writeBookmarks({
      placesPath,
      browserId: 'firefox',
      profileDir,
      snapshot: snapshot(),
      userDataDir,
    });

    const backupRoot = path.join(userDataDir, 'backups', 'firefox', 'firefox');
    const files = readdirSync(backupRoot).filter(
      (f) => f.startsWith('places.') && f.endsWith('.sqlite'),
    );
    expect(files.length).toBe(1);
  });

  it('keeps at most 3 backups (rotating)', () => {
    for (let i = 0; i < 5; i++) {
      writeBookmarks({
        placesPath,
        browserId: 'firefox',
        profileDir,
        snapshot: snapshot(),
        userDataDir,
      });
      // Tiny gap so timestamps differ.
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy-wait
      }
    }
    const backupRoot = path.join(userDataDir, 'backups', 'firefox', 'firefox');
    const files = readdirSync(backupRoot).filter(
      (f) => f.startsWith('places.') && f.endsWith('.sqlite'),
    );
    expect(files.length).toBeLessThanOrEqual(3);
  });

  it('leaves the mobile root untouched (Firefox Sync)', () => {
    // Pre-populate mobile with a bookmark via raw SQL — the writer must NOT touch it.
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(placesPath);
    db.prepare(`
      INSERT INTO moz_places (id, url, url_hash, rev_host, frecency, guid)
      VALUES (5000, 'https://sync.example/', 0, '', -1, 'syncplace___')
    `).run();
    db.prepare(`
      INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid)
      VALUES (5001, 1, 5000, 6, 0, 'Sync Bookmark', 'syncbm______')
    `).run();
    db.close();

    writeBookmarks({
      placesPath,
      browserId: 'firefox',
      profileDir,
      snapshot: snapshot(),
      userDataDir,
    });

    const read = readBookmarks(placesPath, 'firefox');
    const sync = read.bookmarks.find((b) => b.title === 'Sync Bookmark');
    expect(sync).toBeDefined();
    expect(sync?.rootKey).toBe('mobile');
  });

  it('writes nested folders whose IDs share a long prefix', () => {
    // Regression: folders synthesised by the sync engine use the full folderPath
    // as their id (e.g. "/lesezeichenleiste/recherche" and
    // "/lesezeichenleiste/recherche/sub-folder"). A naive slice(0, 12) GUID
    // would collide here and trigger UNIQUE constraint failures.
    const nested: NormalizedSnapshot = {
      browserId: 'firefox',
      folders: [
        {
          id: '/lesezeichenleiste/recherche',
          name: 'Recherche',
          pathNormalized: '/lesezeichenleiste/recherche',
          parentPath: '/lesezeichenleiste',
          rootKey: 'toolbar',
          dateAdded: null,
          dateModified: null,
        },
        {
          id: '/lesezeichenleiste/recherche/sub-folder',
          name: 'Sub',
          pathNormalized: '/lesezeichenleiste/recherche/sub-folder',
          parentPath: '/lesezeichenleiste/recherche',
          rootKey: 'toolbar',
          dateAdded: null,
          dateModified: null,
        },
      ],
      bookmarks: [
        {
          id: 'a'.repeat(32),
          url: 'https://example.com/a',
          urlNormalized: 'https://example.com/a',
          title: 'A',
          folderPath: '/lesezeichenleiste/recherche',
          rootKey: 'toolbar',
          dateAdded: null,
          dateModified: null,
        },
        {
          id: 'b'.repeat(32),
          url: 'https://example.com/b',
          urlNormalized: 'https://example.com/b',
          title: 'B',
          folderPath: '/lesezeichenleiste/recherche/sub-folder',
          rootKey: 'toolbar',
          dateAdded: null,
          dateModified: null,
        },
      ],
    };

    expect(() =>
      writeBookmarks({
        placesPath,
        browserId: 'firefox',
        profileDir,
        snapshot: nested,
        userDataDir,
      }),
    ).not.toThrow();

    const read = readBookmarks(placesPath, 'firefox');
    expect(read.bookmarks.map((b) => b.title).sort()).toEqual(['A', 'B']);
    expect(read.folders.find((f) => f.name === 'Sub')?.parentPath).toBe(
      '/lesezeichenleiste/recherche',
    );
  });

  it('replaces existing bookmarks under the writable roots', () => {
    // First write
    writeBookmarks({
      placesPath,
      browserId: 'firefox',
      profileDir,
      snapshot: snapshot(),
      userDataDir,
    });
    const first = readBookmarks(placesPath, 'firefox');
    expect(first.bookmarks.find((b) => b.title === 'A')).toBeDefined();

    // Second write with different content
    const newSnapshot: NormalizedSnapshot = {
      browserId: 'firefox',
      folders: [],
      bookmarks: [
        {
          id: 'fresh_______',
          url: 'https://example.com/fresh',
          urlNormalized: 'https://example.com/fresh',
          title: 'Fresh',
          folderPath: '/andere-lesezeichen',
          rootKey: 'unfiled',
          dateAdded: '2026-01-01T00:00:00.000Z',
          dateModified: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    writeBookmarks({
      placesPath,
      browserId: 'firefox',
      profileDir,
      snapshot: newSnapshot,
      userDataDir,
    });
    const second = readBookmarks(placesPath, 'firefox');
    const titles = second.bookmarks.map((b) => b.title);
    expect(titles).toEqual(['Fresh']);
  });
});
