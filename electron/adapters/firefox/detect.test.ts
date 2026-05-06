// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FIREFOX_BROWSERS, detectAll } from './detect';

describe('detect (firefox)', () => {
  it('exposes firefox and zen configs with macOS profile bases', () => {
    const ids = FIREFOX_BROWSERS.map((b) => b.id).sort();
    expect(ids).toEqual(['firefox', 'zen']);

    const firefox = FIREFOX_BROWSERS.find((b) => b.id === 'firefox')!;
    expect(firefox.profileBaseDir).toMatch(/Library\/Application Support\/Firefox$/);
    expect(firefox.appBundleNames).toContain('Firefox.app');

    const zen = FIREFOX_BROWSERS.find((b) => b.id === 'zen')!;
    expect(zen.profileBaseDir).toMatch(/Library\/Application Support\/zen$/);
  });

  it('detectAll returns one entry per configured browser without crashing', () => {
    const result = detectAll();
    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(typeof r.installed).toBe('boolean');
      expect(typeof r.hasDefaultProfile).toBe('boolean');
      expect(r.lock).toBeDefined();
    }
  });
});
