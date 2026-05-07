// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from './resolve';
import { hashOf } from './identity';
import type {
  BookmarkChange,
  BrowserId,
  CloudBookmark,
  NormalizedBookmark,
} from './types';

const bookmark = (overrides: Partial<NormalizedBookmark>): NormalizedBookmark => ({
  id: 'x',
  url: 'https://example.com/',
  urlNormalized: 'https://example.com/',
  title: 'Example',
  folderPath: '/lesezeichenleiste',
  rootKey: 'toolbar',
  dateAdded: null,
  dateModified: null,
  ...overrides,
});

function makeInput(args: {
  changesByBrowser: Map<BrowserId, BookmarkChange[]>;
  currentByBrowser?: Map<BrowserId, Map<string, NormalizedBookmark>>;
  cloudByHash?: Map<string, CloudBookmark>;
  syncRunAt?: string;
}) {
  return {
    userId: 'user-1',
    syncRunId: 'run-1',
    syncRunAt: args.syncRunAt ?? '2026-05-06T10:00:00.000Z',
    changesByBrowser: args.changesByBrowser,
    cloudByHash: args.cloudByHash ?? new Map(),
    currentByBrowser: args.currentByBrowser ?? new Map(),
  };
}

describe('resolve', () => {
  it('emits an upsert when a single browser added a bookmark', () => {
    const bm = bookmark({ urlNormalized: 'https://a/' });
    const hash = hashOf(bm);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map([
          ['firefox', [{ kind: 'added', hash, value: bm }]],
        ]),
        currentByBrowser: new Map([['firefox', new Map([[hash, bm]])]]),
      }),
    );
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].title).toBe('Example');
    expect(result.upserts[0].source_browsers).toEqual(['firefox']);
    expect(result.deletes).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('emits no conflict when two browsers agree on the same change', () => {
    const bm = bookmark({ urlNormalized: 'https://a/', title: 'Agreed' });
    const hash = hashOf(bm);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'updated', hash, value: bm }]],
          ['chrome', [{ kind: 'updated', hash, value: bm }]],
        ]),
        currentByBrowser: new Map([
          ['firefox', new Map([[hash, bm]])],
          ['chrome', new Map([[hash, bm]])],
        ]),
      }),
    );
    expect(result.conflicts).toEqual([]);
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].source_browsers.sort()).toEqual(['chrome', 'firefox']);
  });

  it('emits a conflict when two browsers updated the same bookmark differently (LWW by dateModified)', () => {
    const fox = bookmark({
      urlNormalized: 'https://a/',
      title: 'Firefox Title',
      dateModified: '2026-05-06T08:00:00.000Z',
    });
    const chr = bookmark({
      urlNormalized: 'https://a/',
      title: 'Chrome Title',
      dateModified: '2026-05-06T09:00:00.000Z',
    });
    const hash = hashOf(fox);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'updated', hash, value: fox }]],
          ['chrome', [{ kind: 'updated', hash, value: chr }]],
        ]),
        currentByBrowser: new Map([
          ['firefox', new Map([[hash, fox]])],
          ['chrome', new Map([[hash, chr]])],
        ]),
      }),
    );
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].title).toBe('Chrome Title'); // newer wins
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].winner_browser_id).toBe('chrome');
    expect(result.conflicts[0].loser_browser_id).toBe('firefox');
    expect(result.conflicts[0].winner_version.title).toBe('Chrome Title');
    expect(result.conflicts[0].loser_version.title).toBe('Firefox Title');
  });

  it('an explicit edit beats a delete (avoids silent edit loss)', () => {
    const edited = bookmark({
      urlNormalized: 'https://a/',
      title: 'Edited',
      dateModified: '2026-05-06T08:00:00.000Z', // older than the delete event
    });
    const tombstone = bookmark({ urlNormalized: 'https://a/', title: 'Old', dateModified: '2026-05-06T10:00:00.000Z' });
    const hash = hashOf(edited);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'updated', hash, value: edited }]],
          ['chrome', [{ kind: 'deleted', hash, value: tombstone }]],
        ]),
        currentByBrowser: new Map([['firefox', new Map([[hash, edited]])]]),
      }),
    );
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].title).toBe('Edited');
    expect(result.deletes).toEqual([]);
    // Conflict logged: chrome delete lost to firefox edit.
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].winner_browser_id).toBe('firefox');
    expect(result.conflicts[0].loser_browser_id).toBe('chrome');
  });

  it('does NOT log a conflict when edit-beats-delete carries the same title', () => {
    // Regression: when one browser's file briefly drops a bookmark (e.g.
    // Chrome rewrote its file while running and trimmed entries), the diff
    // fires a delete on that side and an add/update with identical content
    // on the other side. The pipeline correctly preserves the bookmark via
    // edit-beats-delete -- but we used to also write a conflict_log row,
    // flooding the log with thousands of identical-title "conflicts" each
    // sync. Same-title delete-vs-live = routine, not a user conflict.
    const live = bookmark({ urlNormalized: 'https://a/', title: 'Ubuntu' });
    const tombstone = bookmark({ urlNormalized: 'https://a/', title: 'Ubuntu' });
    const hash = hashOf(live);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'added', hash, value: live }]],
          ['chrome', [{ kind: 'deleted', hash, value: tombstone }]],
        ]),
        currentByBrowser: new Map([['firefox', new Map([[hash, live]])]]),
      }),
    );
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].title).toBe('Ubuntu');
    expect(result.deletes).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it('Safari without dateModified falls back to syncRunAt and tie-breaks alphabetically', () => {
    const safari = bookmark({
      urlNormalized: 'https://a/',
      title: 'Safari Title',
      dateModified: null, // safari never carries this
    });
    const firefox = bookmark({
      urlNormalized: 'https://a/',
      title: 'Firefox Title',
      dateModified: '2026-05-06T10:00:00.000Z', // exactly syncRunAt
    });
    const hash = hashOf(safari);
    const result = resolve(
      makeInput({
        syncRunAt: '2026-05-06T10:00:00.000Z',
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['safari', [{ kind: 'updated', hash, value: safari }]],
          ['firefox', [{ kind: 'updated', hash, value: firefox }]],
        ]),
        currentByBrowser: new Map([
          ['safari', new Map([[hash, safari]])],
          ['firefox', new Map([[hash, firefox]])],
        ]),
      }),
    );
    // Same effective timestamp, alphabetic tie-break -> safari > firefox
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].title).toBe('Safari Title');
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].winner_browser_id).toBe('safari');
    expect(result.conflicts[0].loser_browser_id).toBe('firefox');
  });

  it('emits a delete when all browsers deleted the bookmark', () => {
    const ghost = bookmark({ urlNormalized: 'https://gone/' });
    const hash = hashOf(ghost);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'deleted', hash, value: ghost }]],
          ['chrome', [{ kind: 'deleted', hash, value: ghost }]],
        ]),
      }),
    );
    expect(result.deletes).toEqual([hash]);
    expect(result.upserts).toEqual([]);
    expect(result.conflicts).toEqual([]); // unanimous delete = not a conflict
  });

  it('source_browsers reflects every browser currently holding the hash', () => {
    const bm = bookmark({ urlNormalized: 'https://a/' });
    const hash = hashOf(bm);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'added', hash, value: bm }]],
        ]),
        currentByBrowser: new Map([
          ['firefox', new Map([[hash, bm]])],
          ['chrome', new Map([[hash, bm]])],
          ['safari', new Map()], // Safari does not have it
        ]),
      }),
    );
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].source_browsers).toEqual(['chrome', 'firefox']);
  });

  it('three-way conflict produces two log entries (winner vs each loser)', () => {
    const a = bookmark({
      urlNormalized: 'https://x/',
      title: 'A',
      dateModified: '2026-05-06T10:00:00.000Z',
    });
    const b = bookmark({
      urlNormalized: 'https://x/',
      title: 'B',
      dateModified: '2026-05-06T11:00:00.000Z',
    });
    const c = bookmark({
      urlNormalized: 'https://x/',
      title: 'C',
      dateModified: '2026-05-06T12:00:00.000Z',
    });
    const hash = hashOf(a);
    const result = resolve(
      makeInput({
        changesByBrowser: new Map<BrowserId, BookmarkChange[]>([
          ['firefox', [{ kind: 'updated', hash, value: a }]],
          ['chrome', [{ kind: 'updated', hash, value: b }]],
          ['safari', [{ kind: 'updated', hash, value: c }]],
        ]),
        currentByBrowser: new Map([
          ['firefox', new Map([[hash, a]])],
          ['chrome', new Map([[hash, b]])],
          ['safari', new Map([[hash, c]])],
        ]),
      }),
    );
    expect(result.upserts.length).toBe(1);
    expect(result.upserts[0].title).toBe('C'); // c is youngest
    expect(result.conflicts.length).toBe(2);
    expect(result.conflicts.every((c) => c.winner_browser_id === 'safari')).toBe(true);
    expect(result.conflicts.map((c) => c.loser_browser_id).sort()).toEqual(['chrome', 'firefox']);
  });
});
