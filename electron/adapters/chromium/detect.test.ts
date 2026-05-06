// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CHROMIUM_BROWSERS, detectAll, detectInstalled } from './detect';

describe('CHROMIUM_BROWSERS', () => {
  it('lists exactly the five Chromium-family browsers we support', () => {
    expect(CHROMIUM_BROWSERS.map((b) => b.id).sort()).toEqual(
      ['arc', 'brave', 'chrome', 'dia', 'edge'].sort(),
    );
  });

  it('every browser has a unique id, app bundle and profile dir', () => {
    const ids = new Set(CHROMIUM_BROWSERS.map((b) => b.id));
    const profiles = new Set(CHROMIUM_BROWSERS.map((b) => b.profileBaseDir));
    expect(ids.size).toBe(CHROMIUM_BROWSERS.length);
    expect(profiles.size).toBe(CHROMIUM_BROWSERS.length);
  });
});

describe('detectAll', () => {
  it('returns one entry per supported browser', () => {
    const results = detectAll();
    expect(results.map((r) => r.id).sort()).toEqual(['arc', 'brave', 'chrome', 'dia', 'edge'].sort());
  });

  it('every entry includes detection signals', () => {
    for (const r of detectAll()) {
      expect(typeof r.installed).toBe('boolean');
      expect(typeof r.hasDefaultProfile).toBe('boolean');
      expect(r.bookmarksPath).toMatch(/Default\/Bookmarks$/);
      expect(r.lock).toBeDefined();
    }
  });
});

describe('detectInstalled', () => {
  it('only returns entries that are both installed and have a default profile', () => {
    for (const r of detectInstalled()) {
      expect(r.installed).toBe(true);
      expect(r.hasDefaultProfile).toBe(true);
    }
  });
});
