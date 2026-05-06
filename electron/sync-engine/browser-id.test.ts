// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALLOWED_BROWSER_IDS, assertBrowserId, isValidBrowserId } from './browser-id';

describe('browser-id whitelist', () => {
  it('accepts every supported browser', () => {
    for (const id of ['safari', 'firefox', 'zen', 'chrome', 'arc', 'brave', 'edge', 'dia']) {
      expect(isValidBrowserId(id)).toBe(true);
    }
  });

  it('rejects unknown browser ids', () => {
    expect(isValidBrowserId('vivaldi')).toBe(false);
    expect(isValidBrowserId('')).toBe(false);
    expect(isValidBrowserId('SAFARI')).toBe(false); // case-sensitive
  });

  it('rejects path-traversal payloads (defense-in-depth from QA)', () => {
    expect(isValidBrowserId('../../etc')).toBe(false);
    expect(isValidBrowserId('safari/../../passwd')).toBe(false);
    expect(isValidBrowserId('chrome\x00')).toBe(false);
  });

  it('assertBrowserId throws on invalid input', () => {
    expect(() => assertBrowserId('vivaldi')).toThrow(/invalid browser id/);
  });

  it('assertBrowserId returns the typed value when valid', () => {
    expect(assertBrowserId('safari')).toBe('safari');
  });

  it('ALLOWED_BROWSER_IDS exposes the same set', () => {
    expect(ALLOWED_BROWSER_IDS.length).toBe(8);
  });
});
