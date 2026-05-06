// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { computeChecksum } from './checksum';
import { ChromiumBookmarksFileSchema, type ChromiumRoots } from './types';

const emptyRoots: ChromiumRoots = {
  bookmark_bar: { id: '1', name: 'Bookmarks bar', type: 'folder', children: [] },
  other: { id: '2', name: 'Other bookmarks', type: 'folder', children: [] },
  synced: { id: '3', name: 'Mobile bookmarks', type: 'folder', children: [] },
};

describe('computeChecksum', () => {
  it('returns a stable hash for an empty-children layout', () => {
    // Three root folders with no children — this is the baseline.
    const result = computeChecksum(emptyRoots);
    expect(result).toMatch(/^[0-9a-f]{32}$/);
    expect(result).toBe(computeChecksum(emptyRoots));
  });

  it('produces the same hash for the same input deterministically', () => {
    const a = computeChecksum(emptyRoots);
    const b = computeChecksum(emptyRoots);
    expect(a).toBe(b);
  });

  it('changes when a single bookmark is added', () => {
    const withOne: ChromiumRoots = {
      ...emptyRoots,
      bookmark_bar: {
        ...emptyRoots.bookmark_bar,
        children: [
          {
            id: '5',
            name: 'GitHub',
            type: 'url',
            url: 'https://github.com',
          },
        ],
      },
    };
    expect(computeChecksum(withOne)).not.toBe(computeChecksum(emptyRoots));
  });

  it('hashes name as UTF-16 LE (umlauts)', () => {
    const a: ChromiumRoots = {
      ...emptyRoots,
      bookmark_bar: {
        ...emptyRoots.bookmark_bar,
        children: [{ id: '5', name: 'Übersicht', type: 'url', url: 'https://example.com' }],
      },
    };
    const b: ChromiumRoots = {
      ...emptyRoots,
      bookmark_bar: {
        ...emptyRoots.bookmark_bar,
        children: [{ id: '5', name: 'Ubersicht', type: 'url', url: 'https://example.com' }],
      },
    };
    expect(computeChecksum(a)).not.toBe(computeChecksum(b));
  });

  it('changes when bookmark order changes (pre-order traversal)', () => {
    const order1: ChromiumRoots = {
      ...emptyRoots,
      bookmark_bar: {
        ...emptyRoots.bookmark_bar,
        children: [
          { id: '5', name: 'A', type: 'url', url: 'https://a.com' },
          { id: '6', name: 'B', type: 'url', url: 'https://b.com' },
        ],
      },
    };
    const order2: ChromiumRoots = {
      ...emptyRoots,
      bookmark_bar: {
        ...emptyRoots.bookmark_bar,
        children: [
          { id: '6', name: 'B', type: 'url', url: 'https://b.com' },
          { id: '5', name: 'A', type: 'url', url: 'https://a.com' },
        ],
      },
    };
    expect(computeChecksum(order1)).not.toBe(computeChecksum(order2));
  });

  it('reproduces the checksum field from a real Chrome Bookmarks file', () => {
    const realPath = path.join(os.homedir(), 'Library/Application Support/Google/Chrome/Default/Bookmarks');
    if (!existsSync(realPath)) {
      return; // Chrome not installed on this machine — skip silently
    }
    const raw = readFileSync(realPath, 'utf8');
    const parsed = ChromiumBookmarksFileSchema.parse(JSON.parse(raw));
    const computed = computeChecksum(parsed.roots);
    expect(computed).toBe(parsed.checksum);
  });
});
