// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ROOT_TO_PATH, PATH_TO_ROOT, READ_ONLY_ROOTS, isReadOnlyPath, rootKeyForPath } from './mapping';

describe('mapping', () => {
  it('roundtrips between root keys and folder paths', () => {
    for (const [key, value] of Object.entries(ROOT_TO_PATH)) {
      expect(PATH_TO_ROOT[value]).toBe(key);
    }
  });

  it('marks only synced as read-only', () => {
    expect(READ_ONLY_ROOTS.has('synced')).toBe(true);
    expect(READ_ONLY_ROOTS.has('bookmark_bar')).toBe(false);
    expect(READ_ONLY_ROOTS.has('other')).toBe(false);
  });

  it('rootKeyForPath returns the right root for top-level paths', () => {
    expect(rootKeyForPath('/lesezeichenleiste')).toBe('bookmark_bar');
    expect(rootKeyForPath('/andere-lesezeichen')).toBe('other');
    expect(rootKeyForPath('/synchronisiert')).toBe('synced');
  });

  it('rootKeyForPath returns the right root for nested paths', () => {
    expect(rootKeyForPath('/lesezeichenleiste/recherche/ai')).toBe('bookmark_bar');
    expect(rootKeyForPath('/synchronisiert/iphone')).toBe('synced');
  });

  it('rootKeyForPath returns null for unknown paths', () => {
    expect(rootKeyForPath('/zufaellig')).toBeNull();
    expect(rootKeyForPath('/')).toBeNull();
  });

  it('isReadOnlyPath flags only synced paths', () => {
    expect(isReadOnlyPath('/synchronisiert')).toBe(true);
    expect(isReadOnlyPath('/synchronisiert/foo')).toBe(true);
    expect(isReadOnlyPath('/lesezeichenleiste')).toBe(false);
    expect(isReadOnlyPath('/andere-lesezeichen/x')).toBe(false);
  });
});
