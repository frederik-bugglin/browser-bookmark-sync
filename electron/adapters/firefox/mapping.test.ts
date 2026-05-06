// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ROOT_TO_PATH,
  PATH_TO_ROOT,
  READ_ONLY_ROOTS,
  isReadOnlyPath,
  rootKeyForPath,
} from './mapping';

describe('mapping', () => {
  it('roundtrips between root keys and folder paths', () => {
    for (const [key, value] of Object.entries(ROOT_TO_PATH)) {
      expect(PATH_TO_ROOT[value]).toBe(key);
    }
  });

  it('marks only mobile (Firefox Sync) as read-only', () => {
    expect(READ_ONLY_ROOTS.has('mobile')).toBe(true);
    expect(READ_ONLY_ROOTS.has('toolbar')).toBe(false);
    expect(READ_ONLY_ROOTS.has('unfiled')).toBe(false);
    expect(READ_ONLY_ROOTS.has('menu')).toBe(false);
  });

  it('rootKeyForPath returns the right root for top-level paths', () => {
    expect(rootKeyForPath('/lesezeichenleiste')).toBe('toolbar');
    expect(rootKeyForPath('/andere-lesezeichen')).toBe('unfiled');
    expect(rootKeyForPath('/synchronisiert')).toBe('mobile');
    expect(rootKeyForPath('/lesezeichen-menu')).toBe('menu');
  });

  it('rootKeyForPath returns the right root for nested paths', () => {
    expect(rootKeyForPath('/lesezeichenleiste/recherche/ai')).toBe('toolbar');
    expect(rootKeyForPath('/lesezeichen-menu/persoenlich')).toBe('menu');
  });

  it('rootKeyForPath returns null for unknown paths', () => {
    expect(rootKeyForPath('/zufaellig')).toBeNull();
    expect(rootKeyForPath('/')).toBeNull();
    expect(rootKeyForPath('')).toBeNull();
  });

  it('isReadOnlyPath flags only mobile paths', () => {
    expect(isReadOnlyPath('/synchronisiert')).toBe(true);
    expect(isReadOnlyPath('/synchronisiert/foo')).toBe(true);
    expect(isReadOnlyPath('/lesezeichenleiste')).toBe(false);
    expect(isReadOnlyPath('/lesezeichen-menu/x')).toBe(false);
  });
});
