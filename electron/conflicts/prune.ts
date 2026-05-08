import type { SupabaseClient } from '@supabase/supabase-js';

// Boot-time pruning. Default retention is 90 days; only entries with status
// 'restored' or 'dismissed' get pruned — open conflicts are sacred so the
// user never silently loses an unseen conflict. Idempotent: a per-user
// last-pruned-at marker file in userData throttles to once per day.

const RETENTION_DAYS = 90;

export async function pruneConflicts(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<{ deleted: number }> {
  const { supabase, userId } = args;
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('conflict_log')
    .delete()
    .eq('user_id', userId)
    .in('status', ['restored', 'dismissed'])
    .lt('created_at', cutoff)
    .select('id');
  if (error) throw new Error(`pruneConflicts failed: ${error.message}`);
  return { deleted: (data ?? []).length };
}
