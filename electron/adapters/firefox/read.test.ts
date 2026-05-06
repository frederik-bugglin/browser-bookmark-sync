// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildFixtureDb, type FixtureBookmark } from './__fixtures__/build-fixture';
import { readBookmarks } from './read';
import { FirefoxParseError } from './types';

describe('readBookmarks', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-firefox-read-'));
    dbPath = path.join(tmpDir, 'places.sqlite');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads bookmarks across all four roots', () => {
    const tree: FixtureBookmark[] = [
      {
        kind: 'folder',
        guid: 'folder001___',
        title: 'Recherche',
        root: 'toolbar',
        parentPath: '/',
        children: [
          { kind: 'url', guid: 'urltb01_____', title: 'Hacker News', url: 'https://news.ycombinator.com/', root: 'toolbar', parentPath: '/recherche' },
        ],
      },
      { kind: 'url', guid: 'urluf01_____', title: 'Beispiel', url: 'https://example.com/', root: 'unfiled', parentPath: '/' },
      { kind: 'url', guid: 'urlmenu01___', title: 'Privates', url: 'https://privat.example/', root: 'menu', parentPath: '/' },
      { kind: 'url', guid: 'urlmob01____', title: 'Mobile', url: 'https://m.example.com/', root: 'mobile', parentPath: '/' },
    ];
    buildFixtureDb(dbPath, tree);

    const snapshot = readBookmarks(dbPath, 'firefox');
    expect(snapshot.browserId).toBe('firefox');

    const titles = snapshot.bookmarks.map((b) => b.title).sort();
    expect(titles).toEqual(['Beispiel', 'Hacker News', 'Mobile', 'Privates']);

    const recherche = snapshot.folders.find((f) => f.name === 'Recherche');
    expect(recherche).toBeDefined();
    expect(recherche?.pathNormalized).toBe('/lesezeichenleiste/recherche');
    expect(recherche?.parentPath).toBe('/lesezeichenleiste');
    expect(recherche?.rootKey).toBe('toolbar');

    const hn = snapshot.bookmarks.find((b) => b.title === 'Hacker News');
    expect(hn?.folderPath).toBe('/lesezeichenleiste/recherche');
    expect(hn?.rootKey).toBe('toolbar');

    const privat = snapshot.bookmarks.find((b) => b.title === 'Privates');
    expect(privat?.rootKey).toBe('menu');
    expect(privat?.folderPath).toBe('/lesezeichen-menu');
  });

  it('synthesises a root folder entry for each of the four roots', () => {
    buildFixtureDb(dbPath, []);
    const snapshot = readBookmarks(dbPath, 'firefox');
    const rootPaths = snapshot.folders
      .filter((f) => f.parentPath === null)
      .map((f) => f.pathNormalized)
      .sort();
    expect(rootPaths).toEqual([
      '/andere-lesezeichen',
      '/lesezeichen-menu',
      '/lesezeichenleiste',
      '/synchronisiert',
    ]);
  });

  it('filters out place: smart-bookmark URLs', () => {
    const tree: FixtureBookmark[] = [
      { kind: 'url', guid: 'smart_______', title: 'Smart', url: 'place:type=6&sort=14', root: 'unfiled', parentPath: '/' },
      { kind: 'url', guid: 'real________', title: 'Real', url: 'https://example.org/', root: 'unfiled', parentPath: '/' },
    ];
    buildFixtureDb(dbPath, tree);

    const snapshot = readBookmarks(dbPath, 'firefox');
    expect(snapshot.bookmarks.map((b) => b.title)).toEqual(['Real']);
  });

  it('does not surface entries from the tags root', () => {
    buildFixtureDb(dbPath, []);
    // Manually add a tag-like entry under the tags root.
    const db = new DatabaseSync(dbPath);
    db.prepare(`
      INSERT INTO moz_places (id, url, url_hash, rev_host, frecency, guid)
      VALUES (999, 'https://tagged.example/', 0, '', -1, 'placetag____')
    `).run();
    db.prepare(`
      INSERT INTO moz_bookmarks (id, type, fk, parent, position, title, guid)
      VALUES (9999, 1, 999, 4, 0, 'tagged-name', 'tagentry____')
    `).run();
    db.close();

    const snapshot = readBookmarks(dbPath, 'firefox');
    expect(snapshot.bookmarks.find((b) => b.url.includes('tagged'))).toBeUndefined();
  });

  it('wraps missing-file errors in FirefoxParseError', () => {
    expect(() => readBookmarks(path.join(tmpDir, 'does-not-exist.sqlite'), 'firefox')).toThrow(
      FirefoxParseError,
    );
  });

  it('wraps corrupt-file errors in FirefoxParseError', () => {
    const garbage = path.join(tmpDir, 'garbage.sqlite');
    writeFileSync(garbage, 'not a sqlite file at all');
    expect(() => readBookmarks(garbage, 'firefox')).toThrow(FirefoxParseError);
  });

  it('normalises URLs with tracking parameters', () => {
    const tree: FixtureBookmark[] = [
      { kind: 'url', guid: 'tracked_____', title: 'Tracked', url: 'https://Example.com/page?utm_source=x&id=1', root: 'unfiled', parentPath: '/' },
    ];
    buildFixtureDb(dbPath, tree);

    const snapshot = readBookmarks(dbPath, 'firefox');
    const tracked = snapshot.bookmarks[0];
    expect(tracked.urlNormalized).toBe('https://example.com/page?id=1');
    // Original URL preserved verbatim.
    expect(tracked.url).toBe('https://Example.com/page?utm_source=x&id=1');
  });
});
