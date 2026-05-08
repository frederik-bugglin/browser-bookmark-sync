// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { restoreConflict } from './restore';
import type { CloudClient } from '../sync-engine/cloud';
import type { ConflictEntry } from './types';

function fakeCloud() {
  const calls: { upsert: { userId: string; rows: unknown[] }[] } = { upsert: [] };
  const cloud: CloudClient = {
    fetchBookmarksCloud: async () => [],
    upsertBookmarksCloud: async (userId, rows) => {
      calls.upsert.push({ userId, rows });
    },
    deleteBookmarksCloud: async () => {},
    fetchSnapshot: async () => null,
    saveSnapshot: async () => {},
    insertConflictLog: async () => {},
  };
  return { cloud, calls };
}

function fakeSupabase(initial: ConflictEntry) {
  const stored: { status: string; resolved_at: string | null } = {
    status: initial.status,
    resolved_at: initial.resolvedAt,
  };
  const builder = {
    eq: () => builder,
    update: (patch: { status: string; resolved_at: string | null }) => {
      Object.assign(stored, patch);
      return builder;
    },
    maybeSingle: async () => ({ data: rowFromEntry({ ...initial, status: stored.status as ConflictEntry['status'] }), error: null }),
    select: () => builder,
  };
  return {
    from: () => builder,
    stored,
  } as unknown as Parameters<typeof restoreConflict>[0]['supabase'] & { stored: typeof stored };
}

function rowFromEntry(e: ConflictEntry) {
  return {
    id: e.id,
    user_id: 'u',
    bookmark_hash: e.bookmarkHash,
    winner_version: e.winnerVersion,
    loser_version: e.loserVersion,
    winner_browser_id: e.winnerBrowserId,
    loser_browser_id: e.loserBrowserId,
    sync_run_id: e.syncRunId,
    status: e.status,
    created_at: e.createdAt,
    resolved_at: e.resolvedAt,
    restore_origin_id: e.restoreOriginId,
  };
}

const baseConflict: ConflictEntry = {
  id: 'c1',
  bookmarkHash: 'h1',
  winnerVersion: {
    id: 'b',
    url: 'https://winner/',
    urlNormalized: 'https://winner/',
    title: 'Winner Title',
    folderPath: '/toolbar/winner',
    rootKey: 'toolbar',
    dateAdded: '2026-01-01T00:00:00.000Z',
    dateModified: '2026-05-07T12:00:00.000Z',
  },
  loserVersion: {
    id: 'b',
    url: 'https://loser/',
    urlNormalized: 'https://loser/',
    title: 'Loser Title',
    folderPath: '/toolbar/loser',
    rootKey: 'toolbar',
    dateAdded: '2026-01-01T00:00:00.000Z',
    dateModified: '2026-05-07T11:50:00.000Z',
  },
  winnerBrowserId: 'firefox',
  loserBrowserId: 'chrome',
  syncRunId: 'run-1',
  status: 'open',
  createdAt: '2026-05-07T12:00:01.000Z',
  resolvedAt: null,
  restoreOriginId: null,
};

describe('restoreConflict', () => {
  it('writes loser version to bookmarks_cloud with fresh date_modified', async () => {
    const { cloud, calls } = fakeCloud();
    const supabase = fakeSupabase(baseConflict);
    const triggerSync = vi.fn().mockResolvedValue(undefined);

    const before = Date.now();
    const res = await restoreConflict({
      supabase,
      cloud,
      userId: 'u',
      conflictId: 'c1',
      triggerSync,
    });

    expect(res.ok).toBe(true);
    expect(calls.upsert).toHaveLength(1);
    const row = calls.upsert[0].rows[0] as { title: string; url: string; date_modified: string };
    expect(row.title).toBe('Loser Title');
    expect(row.url).toBe('https://loser/');
    expect(new Date(row.date_modified).getTime()).toBeGreaterThanOrEqual(before);
    expect(supabase.stored.status).toBe('restored');
    expect(triggerSync).toHaveBeenCalled();
  });

  it('refuses when conflict status is not open', async () => {
    const { cloud, calls } = fakeCloud();
    const supabase = fakeSupabase({ ...baseConflict, status: 'restored' });
    const triggerSync = vi.fn();

    const res = await restoreConflict({
      supabase,
      cloud,
      userId: 'u',
      conflictId: 'c1',
      triggerSync,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not-open');
    expect(calls.upsert).toHaveLength(0);
    expect(triggerSync).not.toHaveBeenCalled();
  });

  it('returns "unknown" reason when conflict not found', async () => {
    const { cloud, calls } = fakeCloud();
    const supabase = {
      from: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
          maybeSingle: async () => ({ data: null, error: null }),
        }),
        select: function () { return this; },
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    } as unknown as Parameters<typeof restoreConflict>[0]['supabase'];
    const triggerSync = vi.fn();

    const res = await restoreConflict({
      supabase,
      cloud,
      userId: 'u',
      conflictId: 'nope',
      triggerSync,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('unknown');
    expect(calls.upsert).toHaveLength(0);
  });
});
