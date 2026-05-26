// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { diffBrowserSnapshot, indexByHash, sourceBrowsersFor } from './diff';
import { hashOf } from './identity';
import type { BrowserId, NormalizedBookmark, NormalizedSnapshot } from './types';

const bookmark = (overrides: Partial<NormalizedBookmark>): NormalizedBookmark => ({
  id: 'x',
  url: 'https://example.com/',
  urlNormalized: 'https://example.com/',
  title: 'Example',
  folderPath: '/lesezeichenleiste',
  rootKey: 'toolbar',
  dateAdded: null,
  dateModified: null,
  ...overrides,
});

const snapshot = (bookmarks: NormalizedBookmark[]): NormalizedSnapshot => ({
  browserId: 'firefox',
  folders: [],
  bookmarks,
});

describe('diff', () => {
  it('first sync (no previous snapshot) reports everything as added', () => {
    const current = snapshot([
      bookmark({ urlNormalized: 'https://a/' }),
      bookmark({ urlNormalized: 'https://b/' }),
    ]);
    const changes = diffBrowserSnapshot(null, current);
    expect(changes.length).toBe(2);
    expect(changes.every((c) => c.kind === 'added')).toBe(true);
  });

  it('detects added bookmarks', () => {
    const previous = snapshot([bookmark({ urlNormalized: 'https://a/' })]);
    const current = snapshot([
      bookmark({ urlNormalized: 'https://a/' }),
      bookmark({ urlNormalized: 'https://b/', title: 'New' }),
    ]);
    const changes = diffBrowserSnapshot(previous, current);
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('added');
    expect(changes[0].value.title).toBe('New');
  });

  it('detects deleted bookmarks', () => {
    const previous = snapshot([
      bookmark({ urlNormalized: 'https://a/' }),
      bookmark({ urlNormalized: 'https://b/' }),
    ]);
    const current = snapshot([bookmark({ urlNormalized: 'https://a/' })]);
    const changes = diffBrowserSnapshot(previous, current);
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('deleted');
    expect(changes[0].value.urlNormalized).toBe('https://b/');
  });

  it('detects updated bookmarks (title change)', () => {
    const previous = snapshot([bookmark({ urlNormalized: 'https://a/', title: 'Old' })]);
    const current = snapshot([bookmark({ urlNormalized: 'https://a/', title: 'New' })]);
    const changes = diffBrowserSnapshot(previous, current);
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('updated');
    expect(changes[0].value.title).toBe('New');
  });

  it('does not report unchanged bookmarks', () => {
    const previous = snapshot([bookmark({ urlNormalized: 'https://a/', title: 'Same' })]);
    const current = snapshot([bookmark({ urlNormalized: 'https://a/', title: 'Same' })]);
    expect(diffBrowserSnapshot(previous, current)).toEqual([]);
  });

  it('stamps dateModified on detected changes if the value lacks one (Chromium fallback)', () => {
    const previous = snapshot([bookmark({ urlNormalized: 'https://a/', title: 'Old' })]);
    const current = snapshot([
      bookmark({ urlNormalized: 'https://a/', title: 'New', dateModified: null }),
    ]);
    const runAt = '2026-06-01T12:00:00.000Z';
    const changes = diffBrowserSnapshot(previous, current, runAt);
    expect(changes.length).toBe(1);
    expect(changes[0].kind).toBe('updated');
    expect(changes[0].value.dateModified).toBe(runAt);
  });

  it('preserves dateModified when the adapter already provided one', () => {
    const existing = '2026-05-01T10:00:00.000Z';
    const previous = snapshot([bookmark({ urlNormalized: 'https://a/', title: 'Old' })]);
    const current = snapshot([
      bookmark({ urlNormalized: 'https://a/', title: 'New', dateModified: existing }),
    ]);
    const changes = diffBrowserSnapshot(previous, current, '2026-06-01T12:00:00.000Z');
    expect(changes[0].value.dateModified).toBe(existing);
  });

  it('treats folder-path change as add+delete (not update)', () => {
    const previous = snapshot([
      bookmark({ urlNormalized: 'https://a/', folderPath: '/lesezeichenleiste' }),
    ]);
    const current = snapshot([
      bookmark({ urlNormalized: 'https://a/', folderPath: '/lesezeichenleiste/recherche' }),
    ]);
    const changes = diffBrowserSnapshot(previous, current);
    expect(changes.length).toBe(2);
    const kinds = changes.map((c) => c.kind).sort();
    expect(kinds).toEqual(['added', 'deleted']);
  });
});

describe('sourceBrowsersFor', () => {
  it('returns sorted list of browsers that currently have a hash', () => {
    const a = bookmark({ urlNormalized: 'https://a/' });
    const hash = hashOf(a);
    const map = new Map<BrowserId, Map<string, NormalizedBookmark>>([
      ['firefox', new Map([[hash, a]])],
      ['safari', new Map([[hash, a]])],
      ['chrome', new Map()],
    ]);
    expect(sourceBrowsersFor(hash, map)).toEqual(['firefox', 'safari']);
  });

  it('returns empty array if no browser currently has the hash', () => {
    const map = new Map<BrowserId, Map<string, NormalizedBookmark>>([
      ['firefox', new Map()],
    ]);
    expect(sourceBrowsersFor('deadbeef', map)).toEqual([]);
  });
});

describe('indexByHash', () => {
  it('keys bookmarks by their identity hash', () => {
    const a = bookmark({ urlNormalized: 'https://a/' });
    const b = bookmark({ urlNormalized: 'https://b/' });
    const map = indexByHash([a, b]);
    expect(map.size).toBe(2);
    expect(map.get(hashOf(a))).toBe(a);
    expect(map.get(hashOf(b))).toBe(b);
  });
});
