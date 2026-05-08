// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runPipeline } from './pipeline';
import { createLogStore } from './log';
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

function bm(overrides: Partial<NormalizedBookmark>): NormalizedBookmark {
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

function snap(browserId: BrowserId, bookmarks: NormalizedBookmark[]): NormalizedSnapshot {
  return { browserId, folders: [], bookmarks };
}

function cloud(): CloudClient & {
  rows: CloudBookmark[];
  upserts: BookmarkUpsert[];
  savedSnapshots: SaveSnapshotArgs[];
  conflicts: ConflictLogInsert[];
} {
  const c = {
    rows: [] as CloudBookmark[],
    upserts: [] as BookmarkUpsert[],
    savedSnapshots: [] as SaveSnapshotArgs[],
    conflicts: [] as ConflictLogInsert[],
    async fetchBookmarksCloud() {
      return c.rows;
    },
    async upsertBookmarksCloud(_userId: string, rows: BookmarkUpsert[]) {
      c.upserts.push(...rows);
    },
    async deleteBookmarksCloud() {},
    async fetchSnapshot() {
      return null;
    },
    async saveSnapshot(args: SaveSnapshotArgs) {
      c.savedSnapshots.push(args);
    },
    async insertConflictLog(rows: ConflictLogInsert[]) {
      c.conflicts.push(...rows);
    },
  };
  return c;
}

function driver(browserId: BrowserId, bookmarks: NormalizedBookmark[]): BrowserDriver {
  return {
    browserId,
    plan: () => ({ browserId, reason: 'eligible' }),
    read: () => snap(browserId, bookmarks),
    write: () => {},
  };
}

describe('runPipeline enabledBrowserIds filter', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'junction-filter-'));
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('only runs for whitelisted browsers when enabledBrowserIds is set', async () => {
    const c = cloud();
    const drivers = [
      driver('firefox', [bm({ urlNormalized: 'https://a/' })]),
      driver('chrome', [bm({ urlNormalized: 'https://b/' })]),
    ];
    const result = await runPipeline({
      userId: 'u',
      cloud: c,
      drivers,
      logStore: createLogStore(tmpDir),
      triggeredBy: 'manual',
      enabledBrowserIds: ['firefox'],
    });
    expect(result.outcome).toBe('success');
    expect(c.savedSnapshots.map((s) => s.browserId)).toEqual(['firefox']);
  });

  it('returns "skipped" when no browsers are whitelisted', async () => {
    const c = cloud();
    const drivers = [driver('firefox', [bm({})])];
    const result = await runPipeline({
      userId: 'u',
      cloud: c,
      drivers,
      logStore: createLogStore(tmpDir),
      triggeredBy: 'manual',
      enabledBrowserIds: [],
    });
    expect(result.outcome).toBe('skipped');
    expect(c.savedSnapshots).toEqual([]);
  });

  it('runs for all drivers when enabledBrowserIds is omitted', async () => {
    const c = cloud();
    const drivers = [
      driver('firefox', [bm({ urlNormalized: 'https://a/' })]),
      driver('chrome', [bm({ urlNormalized: 'https://b/' })]),
    ];
    const result = await runPipeline({
      userId: 'u',
      cloud: c,
      drivers,
      logStore: createLogStore(tmpDir),
      triggeredBy: 'manual',
    });
    expect(result.outcome).toBe('success');
    expect(c.savedSnapshots.map((s) => s.browserId).sort()).toEqual(['chrome', 'firefox']);
  });
});
