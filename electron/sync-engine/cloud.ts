import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrowserId,
  CloudBookmark,
  ConflictLogInsert,
  NormalizedBookmark,
  NormalizedSnapshot,
  RootKey,
  SyncEngineError as SyncEngineErrorType,
} from './types';
import { SyncEngineError } from './types';

// Layer between the engine and Supabase. The engine uses these functions and
// nothing else. Tests pass a mocked CloudClient that records calls instead of
// hitting the network.

export type CloudClient = {
  fetchBookmarksCloud(userId: string): Promise<CloudBookmark[]>;
  upsertBookmarksCloud(userId: string, rows: BookmarkUpsert[]): Promise<void>;
  deleteBookmarksCloud(userId: string, hashes: string[]): Promise<void>;
  fetchSnapshot(userId: string, browserId: BrowserId): Promise<NormalizedSnapshot | null>;
  saveSnapshot(args: SaveSnapshotArgs): Promise<void>;
  insertConflictLog(rows: ConflictLogInsert[]): Promise<void>;
};

export type BookmarkUpsert = {
  bookmark_hash: string;
  url: string;
  url_normalized: string;
  title: string;
  folder_path: string;
  root_key: RootKey;
  source_browsers: string[];
  date_added: string | null;
  date_modified: string | null;
};

export type SaveSnapshotArgs = {
  userId: string;
  browserId: BrowserId;
  snapshot: NormalizedSnapshot;
  syncRunId: string;
};

const BATCH_SIZE = 500;

export function createSupabaseCloudClient(supabase: SupabaseClient): CloudClient {
  return {
    async fetchBookmarksCloud(userId) {
      // Supabase's REST API caps responses at ~1000 rows regardless of any
      // client-side .limit(). With a multi-thousand-bookmark library that
      // truncation silently shrinks mergedByHash and the projected snapshot
      // for every target browser. Page through with .range() until the
      // server returns fewer than PAGE rows.
      const PAGE = 1000;
      const all: CloudBookmark[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from('bookmarks_cloud')
          .select('*')
          .eq('user_id', userId)
          .range(from, from + PAGE - 1);
        if (error) throw new SyncEngineError(`fetchBookmarksCloud failed: ${error.message}`, error);
        const rows = (data ?? []) as CloudBookmark[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },

    async upsertBookmarksCloud(userId, rows) {
      // Batch-Upserts in chunks to respect Supabase's 1MB / 500-row guidance.
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, user_id: userId }));
        const { error } = await supabase
          .from('bookmarks_cloud')
          .upsert(chunk, { onConflict: 'user_id,bookmark_hash' });
        if (error) throw new SyncEngineError(`upsertBookmarksCloud failed: ${error.message}`, error);
      }
    },

    async deleteBookmarksCloud(userId, hashes) {
      if (hashes.length === 0) return;
      // Postgres has limits on the IN clause length; we chunk.
      for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
        const chunk = hashes.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('bookmarks_cloud')
          .delete()
          .eq('user_id', userId)
          .in('bookmark_hash', chunk);
        if (error) throw new SyncEngineError(`deleteBookmarksCloud failed: ${error.message}`, error);
      }
    },

    async fetchSnapshot(userId, browserId) {
      const { data, error } = await supabase
        .from('bookmark_snapshots')
        .select('snapshot_json')
        .eq('user_id', userId)
        .eq('browser_id', browserId)
        .maybeSingle();
      if (error) throw new SyncEngineError(`fetchSnapshot failed: ${error.message}`, error);
      if (!data) return null;
      return data.snapshot_json as NormalizedSnapshot;
    },

    async saveSnapshot({ userId, browserId, snapshot, syncRunId }) {
      const { error } = await supabase
        .from('bookmark_snapshots')
        .upsert(
          {
            user_id: userId,
            browser_id: browserId,
            snapshot_json: snapshot,
            sync_run_id: syncRunId,
            captured_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,browser_id' },
        );
      if (error) throw new SyncEngineError(`saveSnapshot failed: ${error.message}`, error);
    },

    async insertConflictLog(rows) {
      if (rows.length === 0) return;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('conflict_log').insert(chunk);
        if (error) throw new SyncEngineError(`insertConflictLog failed: ${error.message}`, error);
      }
    },
  };
}

// Convert a NormalizedBookmark into the wire format used by upsertBookmarksCloud.
export function bookmarkToUpsert(
  bookmark: NormalizedBookmark,
  hash: string,
  sourceBrowsers: string[],
): BookmarkUpsert {
  return {
    bookmark_hash: hash,
    url: bookmark.url,
    url_normalized: bookmark.urlNormalized,
    title: bookmark.title,
    folder_path: bookmark.folderPath,
    root_key: bookmark.rootKey,
    source_browsers: sourceBrowsers,
    date_added: bookmark.dateAdded,
    date_modified: bookmark.dateModified,
  };
}

// Convert a CloudBookmark row back to the NormalizedBookmark shape the rest
// of the engine works with. The id field uses bookmark_hash because cloud
// rows have no per-browser id.
export function cloudToNormalized(row: CloudBookmark): NormalizedBookmark {
  return {
    id: row.bookmark_hash,
    url: row.url,
    urlNormalized: row.url_normalized,
    title: row.title,
    folderPath: row.folder_path,
    rootKey: row.root_key,
    dateAdded: row.date_added,
    dateModified: row.date_modified,
  };
}

// Re-exported so consumers can import everything from one place.
export type { SyncEngineErrorType };
