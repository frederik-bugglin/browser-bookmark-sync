// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isReadOnlyRoot, projectForBrowser, routeForTarget } from './route';
import type { NormalizedBookmark } from './types';

const make = (overrides: Partial<NormalizedBookmark>): NormalizedBookmark => ({
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

describe('route', () => {
  it('Safari has no read-only roots', () => {
    expect(isReadOnlyRoot('safari', 'toolbar')).toBe(false);
    expect(isReadOnlyRoot('safari', 'unfiled')).toBe(false);
    expect(isReadOnlyRoot('safari', 'mobile')).toBe(false);
  });

  it('Firefox/Zen treat mobile as read-only', () => {
    expect(isReadOnlyRoot('firefox', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('zen', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('firefox', 'toolbar')).toBe(false);
  });

  it('Chromium family treats mobile (= synced) as read-only', () => {
    expect(isReadOnlyRoot('chrome', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('arc', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('brave', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('edge', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('dia', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('chrome', 'toolbar')).toBe(false);
  });

  it('writable roots route to the same path', () => {
    const bookmark = make({ folderPath: '/lesezeichenleiste/recherche' });
    const result = routeForTarget(bookmark, 'firefox');
    expect(result.rootKey).toBe('toolbar');
    expect(result.folderPath).toBe('/lesezeichenleiste/recherche');
  });

  it('mobile-root bookmarks reroute to unfiled in chromium target', () => {
    const bookmark = make({ folderPath: '/synchronisiert', rootKey: 'mobile' });
    const result = routeForTarget(bookmark, 'chrome');
    expect(result.rootKey).toBe('unfiled');
    expect(result.folderPath).toBe('/andere-lesezeichen');
  });

  it('mobile-root bookmarks reroute to unfiled in firefox target', () => {
    const bookmark = make({ folderPath: '/synchronisiert', rootKey: 'mobile' });
    const result = routeForTarget(bookmark, 'firefox');
    expect(result.rootKey).toBe('unfiled');
    expect(result.folderPath).toBe('/andere-lesezeichen');
  });

  it('mobile-root bookmarks pass through unchanged for safari (no read-only-root)', () => {
    const bookmark = make({ folderPath: '/synchronisiert', rootKey: 'mobile' });
    const result = routeForTarget(bookmark, 'safari');
    expect(result.rootKey).toBe('mobile');
    expect(result.folderPath).toBe('/synchronisiert');
  });

  it('projectForBrowser returns the original ref when no rerouting needed', () => {
    const bookmark = make({});
    const projected = projectForBrowser(bookmark, 'firefox');
    expect(projected).toBe(bookmark);
  });

  it('projectForBrowser returns a new object when rerouting', () => {
    const bookmark = make({ folderPath: '/synchronisiert', rootKey: 'mobile' });
    const projected = projectForBrowser(bookmark, 'firefox');
    expect(projected).not.toBe(bookmark);
    expect(projected.rootKey).toBe('unfiled');
    expect(projected.folderPath).toBe('/andere-lesezeichen');
    expect(projected.url).toBe(bookmark.url);
  });
});
