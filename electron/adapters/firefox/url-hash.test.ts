// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { computeUrlHash, reverseHost } from './url-hash';

describe('computeUrlHash', () => {
  it('returns a 48-bit bigint for a typical URL', () => {
    const hash = computeUrlHash('https://example.com/');
    expect(typeof hash).toBe('bigint');
    expect(hash).toBeGreaterThan(0n);
    // 48 bits max -> 2^48 - 1
    expect(hash).toBeLessThanOrEqual((1n << 48n) - 1n);
  });

  it('produces different hashes for different URLs', () => {
    const a = computeUrlHash('https://example.com/');
    const b = computeUrlHash('https://example.com/page');
    const c = computeUrlHash('http://example.com/');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c); // different scheme prefix bucket
  });

  it('is deterministic across calls', () => {
    const a = computeUrlHash('https://news.ycombinator.com/item?id=1');
    const b = computeUrlHash('https://news.ycombinator.com/item?id=1');
    expect(a).toBe(b);
  });

  it('places same-scheme URLs in the same prefix bucket', () => {
    const a = computeUrlHash('https://example.com/');
    const b = computeUrlHash('https://other.com/path');
    // Top 16 bits = prefix bucket; for the same scheme it should match.
    const bucketA = a >> 32n;
    const bucketB = b >> 32n;
    expect(bucketA).toBe(bucketB);
  });
});

describe('reverseHost', () => {
  it('reverses the hostname and appends a trailing dot', () => {
    expect(reverseHost('https://example.com/')).toBe('moc.elpmaxe.');
    expect(reverseHost('https://news.ycombinator.com/')).toBe('moc.rotanibmocy.swen.');
  });

  it('returns empty string for invalid URLs', () => {
    expect(reverseHost('not a url')).toBe('');
  });

  it('returns empty string for URLs without a hostname', () => {
    expect(reverseHost('about:blank')).toBe('');
  });
});
