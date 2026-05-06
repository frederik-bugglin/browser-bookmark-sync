// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { bookmarksDiffer, computeBookmarkHash, hashOf } from './identity';
import type { NormalizedBookmark } from './types';

const sample: NormalizedBookmark = {
  id: 'x',
  url: 'https://anthropic.com/',
  urlNormalized: 'https://anthropic.com/',
  title: 'Anthropic',
  folderPath: '/lesezeichenleiste',
  rootKey: 'toolbar',
  dateAdded: null,
  dateModified: null,
};

describe('identity', () => {
  it('hashes are deterministic for the same input', () => {
    expect(computeBookmarkHash('https://a.example/', '/x', 'toolbar')).toBe(
      computeBookmarkHash('https://a.example/', '/x', 'toolbar'),
    );
  });

  it('different urls produce different hashes', () => {
    const h1 = computeBookmarkHash('https://a.example/', '/x', 'toolbar');
    const h2 = computeBookmarkHash('https://b.example/', '/x', 'toolbar');
    expect(h1).not.toBe(h2);
  });

  it('different rootKey produces a different hash even with same url+path', () => {
    const a = computeBookmarkHash('https://x/', '/p', 'toolbar');
    const b = computeBookmarkHash('https://x/', '/p', 'unfiled');
    expect(a).not.toBe(b);
  });

  it('hash is 32 hex characters', () => {
    const h = computeBookmarkHash('https://a/', '/', 'toolbar');
    expect(h).toMatch(/^[0-9a-f]{32}$/);
  });

  it('hashOf delegates to computeBookmarkHash', () => {
    expect(hashOf(sample)).toBe(
      computeBookmarkHash(sample.urlNormalized, sample.folderPath, sample.rootKey),
    );
  });

  it('bookmarksDiffer detects title change', () => {
    expect(bookmarksDiffer(sample, { ...sample, title: 'Anthropic AI' })).toBe(true);
  });

  it('bookmarksDiffer is false for identical bookmarks', () => {
    expect(bookmarksDiffer(sample, { ...sample })).toBe(false);
  });

  it('bookmarksDiffer ignores dateModified differences (LWW uses dateModified, identity uses title)', () => {
    expect(
      bookmarksDiffer(sample, { ...sample, dateModified: '2026-05-01T00:00:00Z' }),
    ).toBe(false);
  });
});
