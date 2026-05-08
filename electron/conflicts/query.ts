import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrowserId, NormalizedBookmark } from '../sync-engine/types';
import type {
  ConflictEntry,
  ConflictFilter,
  ConflictListResult,
  ConflictStatus,
} from './types';

// Server-side filtered queries against conflict_log. Renderer reaches these
// through IPC; the SyncEngine writes inserts but never reads back. Owner-only
// RLS is enforced server-side, so every query also passes user_id explicitly.

const DEFAULT_LIMIT = 50;

type Row = {
  id: string;
  user_id: string;
  bookmark_hash: string;
  winner_version: NormalizedBookmark;
  loser_version: NormalizedBookmark;
  winner_browser_id: BrowserId;
  loser_browser_id: BrowserId;
  sync_run_id: string;
  status: ConflictStatus;
  created_at: string;
  resolved_at: string | null;
  restore_origin_id: string | null;
};

function rowToEntry(row: Row): ConflictEntry {
  return {
    id: row.id,
    bookmarkHash: row.bookmark_hash,
    winnerVersion: row.winner_version,
    loserVersion: row.loser_version,
    winnerBrowserId: row.winner_browser_id,
    loserBrowserId: row.loser_browser_id,
    syncRunId: row.sync_run_id,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    restoreOriginId: row.restore_origin_id,
  };
}

export async function listConflicts(
  supabase: SupabaseClient,
  userId: string,
  filter: ConflictFilter,
): Promise<ConflictListResult> {
  const limit = filter.limit ?? DEFAULT_LIMIT;
  const offset = filter.offset ?? 0;

  let q = supabase
    .from('conflict_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit); // request limit+1 to detect "has more"

  if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
  if (filter.winnerBrowserIds?.length) q = q.in('winner_browser_id', filter.winnerBrowserIds);
  if (filter.loserBrowserIds?.length) q = q.in('loser_browser_id', filter.loserBrowserIds);
  if (filter.createdFrom) q = q.gte('created_at', filter.createdFrom);
  if (filter.createdTo) q = q.lte('created_at', filter.createdTo);
  if (filter.search && filter.search.trim()) {
    // ilike across both title (winner_version->>title) and url. Supabase
    // doesn't allow OR on JSON paths via the JS client, so we use a single
    // textSearch-style "or" expression.
    const escaped = filter.search.replace(/[%_,]/g, (c) => `\\${c}`);
    const pattern = `%${escaped}%`;
    q = q.or(
      `winner_version->>title.ilike.${pattern},winner_version->>url.ilike.${pattern}`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(`listConflicts failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  return {
    entries: slice.map(rowToEntry),
    hasMore,
    nextOffset: hasMore ? offset + limit : null,
  };
}

export async function getConflictById(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<ConflictEntry | null> {
  const { data, error } = await supabase
    .from('conflict_log')
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getConflictById failed: ${error.message}`);
  return data ? rowToEntry(data as Row) : null;
}

export async function countConflictsSince(
  supabase: SupabaseClient,
  userId: string,
  since: string | null,
): Promise<number> {
  let q = supabase
    .from('conflict_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'open');
  if (since) q = q.gt('created_at', since);
  const { count, error } = await q;
  if (error) throw new Error(`countConflictsSince failed: ${error.message}`);
  return count ?? 0;
}

export async function setConflictStatus(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  status: 'restored' | 'dismissed',
): Promise<void> {
  const { error } = await supabase
    .from('conflict_log')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id);
  if (error) throw new Error(`setConflictStatus failed: ${error.message}`);
}
