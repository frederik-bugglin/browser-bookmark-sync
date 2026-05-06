// @vitest-environment node
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { readBookmarks } from './read';
import { ChromiumParseError } from './types';

const fixturePath = path.join(__dirname, '__fixtures__/sample-bookmarks.json');

describe('readBookmarks', () => {
  it('returns a snapshot with the given browserId', () => {
    const snapshot = readBookmarks(fixturePath, 'chrome');
    expect(snapshot.browserId).toBe('chrome');
  });

  it('flattens nested folders into pathNormalized strings', () => {
    const snapshot = readBookmarks(fixturePath, 'chrome');
    const folderPaths = snapshot.folders.map((f) => f.pathNormalized).sort();
    expect(folderPaths).toEqual(
      ['/andere-lesezeichen', '/lesezeichenleiste', '/lesezeichenleiste/recherche', '/lesezeichenleiste/recherche/sub-folder', '/synchronisiert'].sort(),
    );
  });

  it('places bookmarks at the correct folder path', () => {
    const snapshot = readBookmarks(fixturePath, 'chrome');
    const github = snapshot.bookmarks.find((b) => b.title === 'GitHub');
    expect(github?.folderPath).toBe('/lesezeichenleiste');
    expect(github?.rootKey).toBe('bookmark_bar');

    const hn = snapshot.bookmarks.find((b) => b.title === 'Hacker News');
    expect(hn?.folderPath).toBe('/lesezeichenleiste/recherche');

    const deep = snapshot.bookmarks.find((b) => b.title === 'Deeply Nested');
    expect(deep?.folderPath).toBe('/lesezeichenleiste/recherche/sub-folder');
  });

  it('reads the synced root as a normal source (read-only enforcement is in write)', () => {
    const snapshot = readBookmarks(fixturePath, 'chrome');
    const ios = snapshot.bookmarks.find((b) => b.title === 'iOS-Bookmark');
    expect(ios).toBeDefined();
    expect(ios?.rootKey).toBe('synced');
    expect(ios?.folderPath).toBe('/synchronisiert');
  });

  it('normalizes URLs (strips utm params)', () => {
    const snapshot = readBookmarks(fixturePath, 'chrome');
    const github = snapshot.bookmarks.find((b) => b.title === 'GitHub');
    expect(github?.url).toBe('https://github.com/?utm_source=newsletter');
    expect(github?.urlNormalized).toBe('https://github.com/');
  });

  it('throws ChromiumParseError on a non-existent file', () => {
    expect(() => readBookmarks('/does/not/exist/Bookmarks', 'chrome')).toThrow();
  });

  it('throws ChromiumParseError on malformed JSON', () => {
    const badPath = path.join(__dirname, '__fixtures__/non-existent.json');
    expect(() => readBookmarks(badPath, 'chrome')).toThrow();
  });
});

describe('ChromiumParseError', () => {
  it('has the right name and includes the browserId', () => {
    const err = new ChromiumParseError('chrome', new Error('inner'));
    expect(err.name).toBe('ChromiumParseError');
    expect(err.browserId).toBe('chrome');
    expect(err.cause).toBeInstanceOf(Error);
  });
});
