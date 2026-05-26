import { EventEmitter } from 'node:events';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudClient } from '../sync-engine/cloud';
import type { JsonStore } from '../store';
import type { AppState } from '../state';
import type { AuthService } from '../auth';
import {
  countConflictsSince,
  getConflictById,
  listConflicts,
  setConflictStatus,
} from './query';
import { restoreConflict } from './restore';
import { pruneConflicts } from './prune';
import type {
  ConflictEntry,
  ConflictFilter,
  ConflictListResult,
  RestoreResult,
} from './types';

export type ConflictsServiceDeps = {
  supabaseProvider: () => SupabaseClient;
  cloud: CloudClient;
  auth: AuthService;
  appStateStore: JsonStore<AppState>;
  triggerSync: () => Promise<void>;
};

export class ConflictsService extends EventEmitter {
  // Single per-day prune throttle. Stored in-memory; if Junction restarts the
  // user simply gets one extra prune the next day, which is fine.
  private lastPrunedAt: number = 0;

  constructor(private readonly deps: ConflictsServiceDeps) {
    super();
  }

  async list(filter: ConflictFilter): Promise<ConflictListResult> {
    const userId = this.requireUserId();
    return listConflicts(this.deps.supabaseProvider(), userId, filter);
  }

  async getById(id: string): Promise<ConflictEntry | null> {
    const userId = this.requireUserId();
    return getConflictById(this.deps.supabaseProvider(), userId, id);
  }

  async countSinceLastSeen(): Promise<number> {
    const userId = this.requireUserId();
    const since = this.deps.appStateStore.get().lastConflictsSeenAt;
    return countConflictsSince(this.deps.supabaseProvider(), userId, since);
  }

  // Total open conflicts irrespective of "last seen" — drives the sync-status
  // warning state in the header and tray.
  async countOpen(): Promise<number> {
    const auth = this.deps.auth.getStatus();
    if (auth.state !== 'authenticated') return 0;
    return countConflictsSince(this.deps.supabaseProvider(), auth.userId, null);
  }

  markSeen(): void {
    this.deps.appStateStore.set({ lastConflictsSeenAt: new Date().toISOString() });
    this.emit('change');
  }

  async restore(id: string): Promise<RestoreResult> {
    const userId = this.requireUserId();
    const result = await restoreConflict({
      supabase: this.deps.supabaseProvider(),
      cloud: this.deps.cloud,
      userId,
      conflictId: id,
      triggerSync: this.deps.triggerSync,
    });
    if (result.ok) this.emit('change');
    return result;
  }

  async dismiss(id: string): Promise<void> {
    const userId = this.requireUserId();
    await setConflictStatus(this.deps.supabaseProvider(), userId, id, 'dismissed');
    this.emit('change');
  }

  /** Once-per-day cloud prune of old non-open conflicts. Safe to call repeatedly. */
  async pruneIfDue(): Promise<void> {
    const auth = this.deps.auth.getStatus();
    if (auth.state !== 'authenticated') return;
    const now = Date.now();
    if (now - this.lastPrunedAt < 24 * 60 * 60 * 1000) return;
    this.lastPrunedAt = now;
    try {
      await pruneConflicts({
        supabase: this.deps.supabaseProvider(),
        userId: auth.userId,
      });
    } catch {
      // Swallow — pruning is best-effort, not critical.
    }
  }

  private requireUserId(): string {
    const status = this.deps.auth.getStatus();
    if (status.state !== 'authenticated') {
      throw new Error('Conflicts API requires sign-in.');
    }
    return status.userId;
  }
}

export type {
  ConflictEntry,
  ConflictFilter,
  ConflictListResult,
  ConflictStatus,
  RestoreResult,
} from './types';
