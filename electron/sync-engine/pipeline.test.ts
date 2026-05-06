// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from './pipeline';
import { createLogStore } from './log';
import { hashOf } from './identity';
import type { BrowserDriver } from './drivers';
import type {
  BookmarkUpsert,
  CloudClient,
  SaveSnapshotArgs,
} from './cloud';
import type {
  BrowserId,
  CloudBookmark,
  ConflictLogInsert,
  NormalizedBookmark,
  NormalizedSnapshot,
} from './types';

function bookmark(overrides: Partial<NormalizedBookmark>): NormalizedBookmark {
  return {
    id: 'x',
    url: 'https://example.com/',
    urlNormalized: 'https://example.com/',
    title: 'Example',
    folderPath: '/lesezeichenleiste',
    rootKey: 'toolbar',
    dateAdded: null,
    dateModified: null,
    ...overrides,
  };
}

function snapshot(browserId: BrowserId, bookmarks: NormalizedBookmark[]): NormalizedSnapshot {
  return { browserId, folders: [], bookmarks };
}

// In-memory cloud client for tests.
type FakeCloud = CloudClient & {
  rows: CloudBookmark[];
  snapshots: Map<string, NormalizedSnapshot>;
  conflicts: ConflictLogInsert[];
  upserts: BookmarkUpsert[];
  deletes: string[];
  savedSnapshots: SaveSnapshotArgs[];
};

function createFakeCloud(initial: Partial<Omit<FakeCloud, keyof CloudClient>> = {}): FakeCloud {
  const cloud: FakeCloud = {
    rows: initial.rows ?? [],
    snapshots: initial.snapshots ?? new Map(),
    conflicts: [],
    upserts: [],
    deletes: [],
    savedSnapshots: [],
    async fetchBookmarksCloud() {
      return cloud.rows;
    },
    async upsertBookmarksCloud(_userId, rows) {
      cloud.upserts.push(...rows);
      // Simulate the upsert into rows so subsequent fetches see them.
      for (const r of rows) {
        const idx = cloud.rows.findIndex((x) => x.bookmark_hash === r.bookmark_hash);
        const cloudRow: CloudBookmark = {
          id: 'cloud-' + r.bookmark_hash,
          user_id: _userId,
          bookmark_hash: r.bookmark_hash,
          url: r.url,
          url_normalized: r.url_normalized,
          title: r.title,
          folder_path: r.folder_path,
          root_key: r.root_key,
          source_browsers: r.source_browsers,
          date_added: r.date_added,
          date_modified: r.date_modified,
          updated_at: '2026-05-06T10:00:00.000Z',
        };
        if (idx >= 0) cloud.rows[idx] = cloudRow;
        else cloud.rows.push(cloudRow);
      }
    },
    async deleteBookmarksCloud(_userId, hashes) {
      cloud.deletes.push(...hashes);
      cloud.rows = cloud.rows.filter((r) => !hashes.includes(r.bookmark_hash));
    },
    async fetchSnapshot(_userId, browserId) {
      return cloud.snapshots.get(browserId) ?? null;
    },
    async saveSnapshot(args) {
      cloud.savedSnapshots.push(args);
      cloud.snapshots.set(args.browserId, args.snapshot);
    },
    async insertConflictLog(rows) {
      cloud.conflicts.push(...rows);
    },
  };
  return cloud;
}

// Simple in-memory driver for tests.
function createFakeDriver(args: {
  browserId: BrowserId;
  initialBookmarks: NormalizedBookmark[];
  fail?: 'read' | 'write';
  rereadOverride?: NormalizedBookmark[]; // for safari race testing
}): BrowserDriver {
  let store = [...args.initialBookmarks];
  return {
    browserId: args.browserId,
    plan() {
      return { browserId: args.browserId, reason: 'eligible' };
    },
    read() {
      if (args.fail === 'read') throw new Error('read fail');
      return snapshot(args.browserId, store);
    },
    write(s) {
      if (args.fail === 'write') throw new Error('write fail');
      store = [...s.bookmarks];
    },
    reread:
      args.browserId === 'safari'
        ? () => snapshot('safari', args.rereadOverride ?? store)
        : undefined,
  };
}

describe('runPipeline', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-pipeline-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Initial sync: union of all browsers, no conflict log', async () => {
    const a = bookmark({ urlNormalized: 'https://a/', title: 'Anthropic' });
    const b = bookmark({ urlNormalized: 'https://b/', title: 'Bookmarks' });

    const cloud = createFakeCloud();
    const drivers = [
      createFakeDriver({ browserId: 'firefox', initialBookmarks: [a] }),
      createFakeDriver({ browserId: 'chrome', initialBookmarks: [b] }),
    ];
    const logStore = createLogStore(tmpDir);

    const result = await runPipeline({
      userId: 'user-1',
      cloud,
      drivers,
      logStore,
      triggeredBy: 'manual',
    });

    expect(result.outcome).toBe('success');
    expect(cloud.conflicts).toEqual([]); // initial sync = no conflicts
    expect(cloud.rows.length).toBe(2);
    expect(cloud.savedSnapshots.length).toBe(2);
    expect(cloud.savedSnapshots.map((s) => s.browserId).sort()).toEqual(['chrome', 'firefox']);
  });

  it('Idempotent: running twice produces no change on the second run', async () => {
    const a = bookmark({ urlNormalized: 'https://a/' });
    const cloud = createFakeCloud();
    const drivers = [createFakeDriver({ browserId: 'firefox', initialBookmarks: [a] })];
    const logStore = createLogStore(tmpDir);

    await runPipeline({ userId: 'user-1', cloud, drivers, logStore, triggeredBy: 'manual' });
    cloud.upserts.length = 0;
    cloud.deletes.length = 0;
    cloud.conflicts.length = 0;

    const second = await runPipeline({
      userId: 'user-1',
      cloud,
      drivers,
      logStore,
      triggeredBy: 'manual',
    });

    expect(second.outcome).toBe('success');
    expect(cloud.upserts).toEqual([]);
    expect(cloud.deletes).toEqual([]);
    expect(cloud.conflicts).toEqual([]);
  });

  it('Conflict between two browsers writes a conflict log row', async () => {
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
    const lastKnown = snapshot('firefox', [
      bookmark({ urlNormalized: 'https://a/', title: 'Original' }),
    ]);
    const lastKnownChrome = snapshot('chrome', [
      bookmark({ urlNormalized: 'https://a/', title: 'Original' }),
    ]);

    const cloud = createFakeCloud({
      snapshots: new Map([
        ['firefox', lastKnown],
        ['chrome', lastKnownChrome],
      ] as [BrowserId, NormalizedSnapshot][]),
      rows: [
        {
          id: 'cloud-orig',
          user_id: 'user-1',
          bookmark_hash: hashOf(fox),
          url: fox.url,
          url_normalized: fox.urlNormalized,
          title: 'Original',
          folder_path: fox.folderPath,
          root_key: fox.rootKey,
          source_browsers: ['firefox', 'chrome'],
          date_added: null,
          date_modified: null,
          updated_at: '2026-05-06T07:00:00.000Z',
        },
      ],
    });

    const drivers = [
      createFakeDriver({ browserId: 'firefox', initialBookmarks: [fox] }),
      createFakeDriver({ browserId: 'chrome', initialBookmarks: [chr] }),
    ];

    const result = await runPipeline({
      userId: 'user-1',
      cloud,
      drivers,
      logStore: createLogStore(tmpDir),
      triggeredBy: 'manual',
    });

    expect(result.outcome).toBe('success');
    expect(cloud.conflicts.length).toBe(1);
    expect(cloud.conflicts[0].winner_browser_id).toBe('chrome');
    expect(cloud.conflicts[0].loser_browser_id).toBe('firefox');
  });

  it('Read failure on one browser does not abort the run', async () => {
    const a = bookmark({ urlNormalized: 'https://a/' });
    const cloud = createFakeCloud();
    const drivers = [
      createFakeDriver({ browserId: 'firefox', initialBookmarks: [a] }),
      createFakeDriver({
        browserId: 'chrome',
        initialBookmarks: [bookmark({ urlNormalized: 'https://b/' })],
        fail: 'read',
      }),
    ];
    const result = await runPipeline({
      userId: 'user-1',
      cloud,
      drivers,
      logStore: createLogStore(tmpDir),
      triggeredBy: 'manual',
    });

    expect(result.outcome).toBe('partial');
    expect(result.log.errors.some((e) => e.includes('chrome'))).toBe(true);
    // Firefox still got synced.
    expect(cloud.savedSnapshots.some((s) => s.browserId === 'firefox')).toBe(true);
    expect(cloud.savedSnapshots.some((s) => s.browserId === 'chrome')).toBe(false);
  });

  it('Safari race detection: re-read showing different bookmarks marks the run as suspect', async () => {
    const expected = bookmark({ urlNormalized: 'https://expected/', title: 'Expected' });
    const racedAway = bookmark({ urlNormalized: 'https://intruder/', title: 'Race' });
    const cloud = createFakeCloud();
    const drivers = [
      createFakeDriver({
        browserId: 'safari',
        initialBookmarks: [expected],
        rereadOverride: [racedAway], // Safari "wrote" something else in parallel
      }),
    ];
    const result = await runPipeline({
      userId: 'user-1',
      cloud,
      drivers,
      logStore: createLogStore(tmpDir),
      triggeredBy: 'manual',
    });

    expect(result.log.safariRaceSuspect).toBe(true);
    expect(result.outcome).toBe('partial');
  });

  it('Skipped run when no browsers are eligible', async () => {
    const ineligibleDriver: BrowserDriver = {
      browserId: 'firefox',
      plan: () => ({ browserId: 'firefox', reason: 'browser-running-write' }),
      read: () => snapshot('firefox', []),
      write: () => {},
    };
    const cloud = createFakeCloud();
    const result = await runPipeline({
      userId: 'user-1',
      cloud,
      drivers: [ineligibleDriver],
      logStore: createLogStore(tmpDir),
      triggeredBy: 'auto',
    });
    expect(result.outcome).toBe('skipped');
    expect(cloud.savedSnapshots).toEqual([]);
  });
});
