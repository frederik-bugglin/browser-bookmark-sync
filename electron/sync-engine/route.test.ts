// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  isReadOnlyRoot,
  isWritableRoot,
  projectForBrowser,
  routeForTarget,
} from './route';
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

describe('route — root-support map', () => {
  it('Safari: toolbar+unfiled writable, no read-only roots', () => {
    expect(isWritableRoot('safari', 'toolbar')).toBe(true);
    expect(isWritableRoot('safari', 'unfiled')).toBe(true);
    expect(isWritableRoot('safari', 'mobile')).toBe(false);
    expect(isWritableRoot('safari', 'menu')).toBe(false);
    expect(isReadOnlyRoot('safari', 'mobile')).toBe(false);
  });

  it('Firefox/Zen: toolbar+unfiled+menu writable, mobile read-only', () => {
    expect(isWritableRoot('firefox', 'toolbar')).toBe(true);
    expect(isWritableRoot('firefox', 'menu')).toBe(true);
    expect(isWritableRoot('firefox', 'mobile')).toBe(false);
    expect(isReadOnlyRoot('firefox', 'mobile')).toBe(true);
    expect(isReadOnlyRoot('zen', 'mobile')).toBe(true);
  });

  it('Chromium family: toolbar+unfiled+menu writable, mobile read-only', () => {
    for (const id of ['chrome', 'arc', 'brave', 'edge', 'dia'] as const) {
      expect(isWritableRoot(id, 'toolbar')).toBe(true);
      expect(isWritableRoot(id, 'menu')).toBe(true);
      expect(isReadOnlyRoot(id, 'mobile')).toBe(true);
    }
  });
});

describe('routeForTarget — write-to-target decision', () => {
  it('keep: writable root in target', () => {
    const result = routeForTarget(
      make({ rootKey: 'toolbar', folderPath: '/lesezeichenleiste/recherche' }),
      'firefox',
    );
    expect(result.action).toBe('keep');
  });

  it('skip: read-only in target AND target already holds it natively', () => {
    const result = routeForTarget(
      make({ rootKey: 'mobile', folderPath: '/synchronisiert' }),
      'firefox',
      ['firefox'],
    );
    expect(result.action).toBe('skip');
  });

  it('reroute: read-only in target AND target does NOT hold it (cross-browser propagation)', () => {
    const result = routeForTarget(
      make({ rootKey: 'mobile', folderPath: '/synchronisiert' }),
      'chrome',
      ['firefox'], // chrome not a source
    );
    expect(result.action).toBe('reroute');
    if (result.action === 'reroute') {
      expect(result.rootKey).toBe('unfiled');
      expect(result.folderPath).toBe('/andere-lesezeichen');
    }
  });

  it('reroute: rootKey not supported by target at all (mobile -> safari)', () => {
    const result = routeForTarget(
      make({ rootKey: 'mobile', folderPath: '/synchronisiert' }),
      'safari',
      ['firefox'],
    );
    expect(result.action).toBe('reroute');
  });

  it('default: empty source_browsers reroutes (no native presence assumed)', () => {
    const result = routeForTarget(
      make({ rootKey: 'mobile', folderPath: '/synchronisiert' }),
      'firefox',
    );
    expect(result.action).toBe('reroute');
  });
});

describe('projectForBrowser — null means skip', () => {
  it('returns the original ref when no rerouting needed (writable root)', () => {
    const bookmark = make({});
    const projected = projectForBrowser(bookmark, 'firefox');
    expect(projected).toBe(bookmark);
  });

  it('returns null for read-only-root bookmark whose target already has it natively', () => {
    const bookmark = make({ rootKey: 'mobile', folderPath: '/synchronisiert' });
    const projected = projectForBrowser(bookmark, 'firefox', ['firefox']);
    expect(projected).toBeNull();
  });

  it('returns a rerouted copy for cross-browser read-only -> unfiled propagation', () => {
    const bookmark = make({ rootKey: 'mobile', folderPath: '/synchronisiert' });
    const projected = projectForBrowser(bookmark, 'chrome', ['firefox']);
    expect(projected).not.toBe(bookmark);
    expect(projected!.rootKey).toBe('unfiled');
    expect(projected!.folderPath).toBe('/andere-lesezeichen');
  });

  it('reroutes mobile -> unfiled for safari (no mobile root in safari)', () => {
    const bookmark = make({ rootKey: 'mobile', folderPath: '/synchronisiert' });
    const projected = projectForBrowser(bookmark, 'safari', ['firefox']);
    expect(projected).not.toBeNull();
    expect(projected!.rootKey).toBe('unfiled');
  });

  it('reroutes menu -> unfiled for safari (no menu root in safari)', () => {
    const bookmark = make({ rootKey: 'menu', folderPath: '/lesezeichen-menu/news' });
    const projected = projectForBrowser(bookmark, 'safari', ['firefox']);
    expect(projected).not.toBeNull();
    expect(projected!.rootKey).toBe('unfiled');
  });
});
