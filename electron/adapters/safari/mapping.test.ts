// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  PATH_TO_ROOT,
  READING_LIST_TITLE,
  ROOT_TO_PATH,
  ROOT_TO_SAFARI_TITLE,
  SAFARI_ROOTS,
  SAFARI_TITLE_TO_ROOT,
  isSafariSyncableRoot,
  rootKeyForPath,
} from './mapping';

describe('safari mapping', () => {
  it('maps the two Safari titles to internal root keys', () => {
    expect(SAFARI_TITLE_TO_ROOT['BookmarksBar']).toBe('toolbar');
    expect(SAFARI_TITLE_TO_ROOT['BookmarksMenu']).toBe('unfiled');
    expect(SAFARI_TITLE_TO_ROOT['com.apple.ReadingList']).toBeUndefined();
  });

  it('inverse mapping covers only the two Safari roots', () => {
    expect(ROOT_TO_SAFARI_TITLE.toolbar).toBe('BookmarksBar');
    expect(ROOT_TO_SAFARI_TITLE.unfiled).toBe('BookmarksMenu');
    expect(ROOT_TO_SAFARI_TITLE.mobile).toBeUndefined();
    expect(ROOT_TO_SAFARI_TITLE.menu).toBeUndefined();
  });

  it('mirrors the same internal paths as Firefox/Chromium', () => {
    expect(ROOT_TO_PATH.toolbar).toBe('/lesezeichenleiste');
    expect(ROOT_TO_PATH.unfiled).toBe('/andere-lesezeichen');
    expect(PATH_TO_ROOT['/lesezeichenleiste']).toBe('toolbar');
  });

  it('isSafariSyncableRoot rejects roots Safari does not store', () => {
    expect(isSafariSyncableRoot('toolbar')).toBe(true);
    expect(isSafariSyncableRoot('unfiled')).toBe(true);
    expect(isSafariSyncableRoot('mobile')).toBe(false);
    expect(isSafariSyncableRoot('menu')).toBe(false);
  });

  it('SAFARI_ROOTS contains exactly the two top-level lists Safari writes', () => {
    expect(Array.from(SAFARI_ROOTS).sort()).toEqual(['toolbar', 'unfiled']);
  });

  it('rootKeyForPath finds the right root for nested paths', () => {
    expect(rootKeyForPath('/lesezeichenleiste')).toBe('toolbar');
    expect(rootKeyForPath('/lesezeichenleiste/recherche')).toBe('toolbar');
    expect(rootKeyForPath('/andere-lesezeichen/x/y')).toBe('unfiled');
    expect(rootKeyForPath('/')).toBeNull();
    expect(rootKeyForPath('/unknown')).toBeNull();
  });

  it('reading-list title is the magic string Safari uses', () => {
    expect(READING_LIST_TITLE).toBe('com.apple.ReadingList');
  });
});
