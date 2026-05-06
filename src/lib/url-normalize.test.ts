import { describe, expect, it } from 'vitest';
import { normalizeUrl, normalizeFolderPath } from './url-normalize';

describe('normalizeUrl', () => {
  it('strips www subdomain', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('https://example.com/page');
  });

  it('lowercases the host but keeps the path case', () => {
    expect(normalizeUrl('https://Example.COM/MyPage')).toBe('https://example.com/MyPage');
  });

  it('drops trailing slash on non-root paths', () => {
    expect(normalizeUrl('https://example.com/a/b/')).toBe('https://example.com/a/b');
  });

  it('keeps the trailing slash on the root path', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('removes UTM tracking params', () => {
    expect(normalizeUrl('https://example.com/x?utm_source=newsletter&utm_medium=email&id=42')).toBe(
      'https://example.com/x?id=42',
    );
  });

  it('removes fbclid and gclid', () => {
    expect(normalizeUrl('https://example.com/?fbclid=abc&gclid=xyz')).toBe('https://example.com/');
  });

  it('drops the URL fragment', () => {
    expect(normalizeUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  it('drops default port 443 for https', () => {
    expect(normalizeUrl('https://example.com:443/x')).toBe('https://example.com/x');
  });

  it('drops default port 80 for http', () => {
    expect(normalizeUrl('http://example.com:80/x')).toBe('http://example.com/x');
  });

  it('keeps non-default ports', () => {
    expect(normalizeUrl('http://example.com:8080/x')).toBe('http://example.com:8080/x');
  });

  it('treats two URLs that differ only in tracking and www as equal', () => {
    const a = normalizeUrl('https://www.example.com/?utm_source=x');
    const b = normalizeUrl('https://example.com');
    expect(a).toBe(b);
  });

  it('falls back to lowercased input for unparseable URLs', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('   ')).toBe('');
  });

  it('preserves query order otherwise', () => {
    expect(normalizeUrl('https://example.com/x?b=2&a=1')).toBe('https://example.com/x?b=2&a=1');
  });
});

describe('normalizeFolderPath', () => {
  it('returns / for an empty segment list', () => {
    expect(normalizeFolderPath([])).toBe('/');
  });

  it('joins segments with slashes', () => {
    expect(normalizeFolderPath(['Arbeit', 'Recherche'])).toBe('/arbeit/recherche');
  });

  it('lowercases segments', () => {
    expect(normalizeFolderPath(['Lesezeichenleiste', 'Privat'])).toBe('/lesezeichenleiste/privat');
  });

  it('drops empty segments', () => {
    expect(normalizeFolderPath(['', 'Arbeit', '   ', 'AI'])).toBe('/arbeit/ai');
  });

  it('returns / when all segments are blank', () => {
    expect(normalizeFolderPath(['', '   '])).toBe('/');
  });
});
