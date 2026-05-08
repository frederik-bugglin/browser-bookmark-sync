import type { CloudClient } from '../sync-engine/cloud';
import type { ConflictEntry, RestoreResult } from './types';
import { getConflictById, setConflictStatus } from './query';
import type { SupabaseClient } from '@supabase/supabase-js';

// Restore re-writes the loser version into bookmarks_cloud with a fresh
// dateModified, then triggers a sync so the change propagates back into all
// enabled browsers. We stay on the cloud side and let the sync engine handle
// the per-adapter writes — never touch adapter files directly from here.
//
// Idempotency: if the conflict status is no longer 'open', we refuse and
// return an explicit reason so the renderer can show "already handled".
export async function restoreConflict(args: {
  supabase: SupabaseClient;
  cloud: CloudClient;
  userId: string;
  conflictId: string;
  triggerSync: () => Promise<void>;
}): Promise<RestoreResult> {
  const { supabase, cloud, userId, conflictId, triggerSync } = args;

  const conflict = await getConflictById(supabase, userId, conflictId);
  if (!conflict) {
    return { ok: false, reason: 'unknown', message: 'Konflikt-Eintrag nicht gefunden.' };
  }
  if (conflict.status !== 'open') {
    return {
      ok: false,
      reason: 'not-open',
      message: 'Dieser Konflikt wurde bereits bearbeitet.',
    };
  }

  const loser = conflict.loserVersion;
  const now = new Date().toISOString();

  // Write the loser version back to bookmarks_cloud with a fresh
  // date_modified. The next sync sees this as the most recent change and
  // propagates it via LWW into every active browser.
  await cloud.upsertBookmarksCloud(userId, [
    {
      bookmark_hash: conflict.bookmarkHash,
      url: loser.url,
      url_normalized: loser.urlNormalized,
      title: loser.title,
      folder_path: loser.folderPath,
      root_key: loser.rootKey,
      source_browsers: [conflict.loserBrowserId],
      date_added: loser.dateAdded,
      date_modified: now,
    },
  ]);

  await setConflictStatus(supabase, userId, conflictId, 'restored');

  // Fire-and-forget the sync trigger. If the sync fails (offline, lock), the
  // conflict is still marked restored — the next sync run picks up the new
  // cloud row and propagates it. Better than rolling back the status flip.
  triggerSync().catch(() => {
    // Swallow; the renderer already saw a success toast and any sync error
    // will surface through the regular sync-status UI.
  });

  return { ok: true };
}

export type { ConflictEntry };
